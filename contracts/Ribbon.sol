// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Ribbon
/// @notice Shared USDC tabs for Arc. A member records an expense, every person
///         in the split confirms the exact shares, and one transaction then
///         pays each creditor from each debtor. Ribbon never holds funds.
/// @dev Amounts use the Arc USDC ERC-20 interface: 6 decimals at
///      0x3600000000000000000000000000000000000000. Do not mix in the 18-decimal
///      native balance. Ledger state is stored in the contract because Arc's
///      public RPC rejects eth_getLogs ranges above 10,000 blocks, and blocks
///      are sub-second. The invite code is emitted once, in the creation
///      receipt, and only its hash is stored.
interface IERC20 {
    function decimals() external view returns (uint8);

    function balanceOf(address account) external view returns (uint256);

    function allowance(address owner, address spender) external view returns (uint256);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract Ribbon {
    uint256 public constant MAX_MEMBERS = 8;
    uint256 public constant MAX_NAME_BYTES = 48;
    uint256 public constant MAX_MEMO_BYTES = 96;
    uint256 public constant MAX_PAGE = 20;

    IERC20 public immutable usdc;

    struct Circle {
        address creator;
        bytes32 inviteHash;
        uint64 createdAt;
        uint32 openExpenses;
        bool closed;
        string name;
    }

    struct Expense {
        address payer;
        uint128 amount;
        uint64 timestamp;
        uint8 confirmations;
        uint8 participantCount;
        bool applied;
        bool cancelled;
        string memo;
    }

    struct Leg {
        address debtor;
        address creditor;
        uint256 amount;
    }

    struct ExpenseView {
        uint256 id;
        address payer;
        uint128 amount;
        uint64 timestamp;
        uint8 confirmations;
        uint8 participantCount;
        bool applied;
        bool cancelled;
        string memo;
        address[] participants;
        uint128[] shares;
        address[] confirmedBy;
    }

    uint256 public circleCount;

    mapping(uint256 => Circle) private _circles;
    mapping(uint256 => address[]) private _members;
    mapping(uint256 => mapping(address => bool)) public isMember;
    mapping(uint256 => mapping(address => int256)) public netOf;
    mapping(uint256 => mapping(address => uint32)) public pendingTouches;
    mapping(uint256 => Expense[]) private _expenses;
    mapping(uint256 => mapping(uint256 => address[])) private _participants;
    mapping(uint256 => mapping(uint256 => uint128[])) private _shares;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public confirmed;
    mapping(address => uint256[]) private _joined;

    uint256 private _lock = 1;

    error ZeroAddress();
    error BadName();
    error BadInvite();
    error UnknownCircle();
    error UnknownExpense();
    error AlreadyMember();
    error NotMember();
    error CircleFull();
    error CircleClosed();
    error ZeroAmount();
    error MemoTooLong();
    error BadSplit();
    error DuplicateParticipant();
    error PayerNotInSplit();
    error ExpenseClosed();
    error AlreadyConfirmed();
    error NothingOwed();
    error AmountTooHigh();
    error OpenBalance();
    error OpenExpense();
    error NotCreator();
    error EmptySettle();
    error Unbalanced();
    error TransferFailed();
    error AllowanceTooLow(address debtor, uint256 need, uint256 have);
    error BalanceTooLow(address debtor, uint256 need, uint256 have);
    error Reentered();

    event CircleCreated(uint256 indexed circleId, address indexed creator, string name, bytes32 inviteCode);
    event Joined(uint256 indexed circleId, address indexed member);
    event Left(uint256 indexed circleId, address indexed member);
    event CircleFinished(uint256 indexed circleId);
    event ExpenseAdded(
        uint256 indexed circleId,
        uint256 indexed expenseId,
        address indexed payer,
        uint128 amount,
        string memo
    );
    event ExpenseConfirmed(uint256 indexed circleId, uint256 indexed expenseId, address indexed member);
    event ExpenseApplied(uint256 indexed circleId, uint256 indexed expenseId);
    event ExpenseCancelled(uint256 indexed circleId, uint256 indexed expenseId, address indexed by);
    event Paid(uint256 indexed circleId, address indexed debtor, address indexed creditor, uint256 amount);
    event Settled(uint256 indexed circleId, uint256 transfers);

    modifier nonReentrant() {
        if (_lock != 1) revert Reentered();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address usdc_) {
        if (usdc_ == address(0)) revert ZeroAddress();
        usdc = IERC20(usdc_);
    }

    /// @notice Open a circle. `salt` is mixed into the invite code so the code
    ///         cannot be predicted from the circle id alone. Save the code from
    ///         the CircleCreated receipt; it is not stored in plaintext.
    function createCircle(string calldata name, bytes32 salt)
        external
        nonReentrant
        returns (uint256 circleId, bytes32 inviteCode)
    {
        uint256 nameBytes = bytes(name).length;
        if (nameBytes == 0 || nameBytes > MAX_NAME_BYTES) revert BadName();

        circleId = ++circleCount;
        inviteCode = keccak256(abi.encode(block.chainid, address(this), circleId, msg.sender, salt));
        if (inviteCode == bytes32(0)) revert BadInvite();

        Circle storage circle = _circles[circleId];
        circle.creator = msg.sender;
        circle.inviteHash = keccak256(abi.encodePacked(inviteCode));
        circle.createdAt = uint64(block.timestamp);
        circle.name = name;

        _addMember(circleId, msg.sender);
        emit CircleCreated(circleId, msg.sender, name, inviteCode);
    }

    function join(uint256 circleId, bytes32 inviteCode) external nonReentrant {
        Circle storage circle = _existing(circleId);
        if (circle.closed) revert CircleClosed();
        if (inviteCode == bytes32(0) || keccak256(abi.encodePacked(inviteCode)) != circle.inviteHash) {
            revert BadInvite();
        }
        _addMember(circleId, msg.sender);
    }

    function inviteMatches(uint256 circleId, bytes32 inviteCode) external view returns (bool) {
        if (_circles[circleId].creator == address(0) || inviteCode == bytes32(0)) return false;
        return keccak256(abi.encodePacked(inviteCode)) == _circles[circleId].inviteHash;
    }

    /// @notice Leave a circle. Balances and unconfirmed expenses must be clear
    ///         so a departure cannot freeze someone else's tab.
    function leave(uint256 circleId) external nonReentrant {
        if (!isMember[circleId][msg.sender]) revert NotMember();
        if (netOf[circleId][msg.sender] != 0) revert OpenBalance();
        if (pendingTouches[circleId][msg.sender] != 0) revert OpenExpense();
        _removeMember(circleId, msg.sender);
        emit Left(circleId, msg.sender);
    }

    function closeCircle(uint256 circleId) external nonReentrant {
        Circle storage circle = _existing(circleId);
        if (circle.creator != msg.sender) revert NotCreator();
        if (circle.closed) revert CircleClosed();
        if (circle.openExpenses != 0) revert OpenExpense();
        address[] storage members = _members[circleId];
        uint256 count = members.length;
        for (uint256 i = 0; i < count; ++i) {
            if (netOf[circleId][members[i]] != 0) revert OpenBalance();
        }
        circle.closed = true;
        emit CircleFinished(circleId);
    }

    /// @notice Record a payment you made. Pass an empty `shares` array for an
    ///         equal split (the remainder goes to the first participants, one
    ///         base unit each). Otherwise `shares` must match `participants`
    ///         and sum to `amount`. Nothing is owed until every participant
    ///         confirms.
    function addExpense(
        uint256 circleId,
        uint128 amount,
        address[] calldata participants,
        uint128[] calldata shares,
        string calldata memo
    ) external nonReentrant returns (uint256 expenseId) {
        if (!isMember[circleId][msg.sender]) revert NotMember();
        Circle storage circle = _existing(circleId);
        if (circle.closed) revert CircleClosed();
        if (amount == 0) revert ZeroAmount();
        if (bytes(memo).length > MAX_MEMO_BYTES) revert MemoTooLong();

        uint256 count = participants.length;
        if (count < 2 || count > MAX_MEMBERS) revert BadSplit();

        bool custom = shares.length != 0;
        if (custom && shares.length != count) revert BadSplit();

        uint128[] memory owed = new uint128[](count);
        bool payerIn = false;
        uint256 sum = 0;
        for (uint256 i = 0; i < count; ++i) {
            address participant = participants[i];
            if (!isMember[circleId][participant]) revert NotMember();
            for (uint256 j = 0; j < i; ++j) {
                if (participants[j] == participant) revert DuplicateParticipant();
            }
            if (participant == msg.sender) payerIn = true;
            if (custom) {
                if (shares[i] == 0) revert BadSplit();
                owed[i] = shares[i];
                sum += shares[i];
            }
        }
        if (!payerIn) revert PayerNotInSplit();

        if (!custom) {
            if (amount < count) revert BadSplit();
            uint128 base = amount / uint128(count);
            uint128 remainder = amount % uint128(count);
            for (uint256 i = 0; i < count; ++i) {
                owed[i] = base + (i < remainder ? 1 : 0);
            }
        } else if (sum != amount) {
            revert BadSplit();
        }

        expenseId = _expenses[circleId].length;
        _expenses[circleId].push();
        Expense storage expense = _expenses[circleId][expenseId];
        expense.payer = msg.sender;
        expense.amount = amount;
        expense.timestamp = uint64(block.timestamp);
        expense.confirmations = 1;
        expense.participantCount = uint8(count);
        expense.memo = memo;
        confirmed[circleId][expenseId][msg.sender] = true;

        for (uint256 i = 0; i < count; ++i) {
            _participants[circleId][expenseId].push(participants[i]);
            _shares[circleId][expenseId].push(owed[i]);
            pendingTouches[circleId][participants[i]] += 1;
        }
        circle.openExpenses += 1;
        emit ExpenseAdded(circleId, expenseId, msg.sender, amount, memo);
    }

    function confirmExpense(uint256 circleId, uint256 expenseId) external nonReentrant {
        if (_circles[circleId].closed) revert CircleClosed();
        Expense storage expense = _expense(circleId, expenseId);
        if (expense.applied || expense.cancelled) revert ExpenseClosed();
        if (!_isParticipant(circleId, expenseId, msg.sender)) revert NotMember();
        if (confirmed[circleId][expenseId][msg.sender]) revert AlreadyConfirmed();

        confirmed[circleId][expenseId][msg.sender] = true;
        expense.confirmations += 1;
        emit ExpenseConfirmed(circleId, expenseId, msg.sender);

        if (expense.confirmations == expense.participantCount) {
            _apply(circleId, expenseId, expense.payer, expense.amount);
            expense.applied = true;
            _clearPending(circleId, expenseId);
            emit ExpenseApplied(circleId, expenseId);
        }
    }

    function cancelExpense(uint256 circleId, uint256 expenseId) external nonReentrant {
        Expense storage expense = _expense(circleId, expenseId);
        if (expense.applied || expense.cancelled) revert ExpenseClosed();
        if (msg.sender != expense.payer && msg.sender != _circles[circleId].creator) revert NotCreator();
        expense.cancelled = true;
        _clearPending(circleId, expenseId);
        emit ExpenseCancelled(circleId, expenseId, msg.sender);
    }

    /// @notice Pay one creditor from your own debit, up to the overlapping net.
    function pay(uint256 circleId, address creditor, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (!isMember[circleId][msg.sender] || !isMember[circleId][creditor]) revert NotMember();

        int256 debt = netOf[circleId][msg.sender];
        int256 credit = netOf[circleId][creditor];
        if (debt >= 0 || credit <= 0) revert NothingOwed();

        uint256 maxDebt = uint256(-debt);
        uint256 maxCredit = uint256(credit);
        uint256 cap = maxDebt < maxCredit ? maxDebt : maxCredit;
        if (amount > cap) revert AmountTooHigh();

        netOf[circleId][msg.sender] = debt + int256(amount);
        netOf[circleId][creditor] = credit - int256(amount);
        _pull(msg.sender, creditor, amount);
        emit Paid(circleId, msg.sender, creditor, amount);
    }

    /// @notice Pull every net balance to zero. Debtors must have approved USDC.
    ///         Anyone in the circle can submit the transaction.
    function settle(uint256 circleId) external nonReentrant returns (uint256 transfers) {
        _existing(circleId);
        (address[] memory members, int256[] memory nets) = _loadNets(circleId);
        Leg[] memory legs = _plan(members, nets);
        if (legs.length == 0) revert EmptySettle();

        for (uint256 i = 0; i < legs.length; ++i) {
            netOf[circleId][legs[i].debtor] += int256(legs[i].amount);
            netOf[circleId][legs[i].creditor] -= int256(legs[i].amount);
        }
        for (uint256 i = 0; i < members.length; ++i) {
            if (netOf[circleId][members[i]] != 0) revert Unbalanced();
        }
        for (uint256 i = 0; i < legs.length; ++i) {
            _pull(legs[i].debtor, legs[i].creditor, legs[i].amount);
            emit Paid(circleId, legs[i].debtor, legs[i].creditor, legs[i].amount);
        }
        transfers = legs.length;
        emit Settled(circleId, transfers);
    }

    function previewSettle(uint256 circleId)
        external
        view
        returns (address[] memory debtors, address[] memory creditors, uint256[] memory amounts)
    {
        _existing(circleId);
        (address[] memory members, int256[] memory nets) = _loadNets(circleId);
        Leg[] memory legs = _plan(members, nets);
        debtors = new address[](legs.length);
        creditors = new address[](legs.length);
        amounts = new uint256[](legs.length);
        for (uint256 i = 0; i < legs.length; ++i) {
            debtors[i] = legs[i].debtor;
            creditors[i] = legs[i].creditor;
            amounts[i] = legs[i].amount;
        }
    }

    function previewEqualSplit(uint128 amount, uint256 count) external pure returns (uint128[] memory shares) {
        if (count < 2 || count > MAX_MEMBERS || amount < count) revert BadSplit();
        shares = new uint128[](count);
        uint128 base = amount / uint128(count);
        uint128 remainder = amount % uint128(count);
        for (uint256 i = 0; i < count; ++i) {
            shares[i] = base + (i < remainder ? 1 : 0);
        }
    }

    function getCircle(uint256 circleId)
        external
        view
        returns (address creator, string memory name, uint64 createdAt, uint16 memberCount, bool closed, uint32 openExpenses)
    {
        Circle storage circle = _existing(circleId);
        creator = circle.creator;
        name = circle.name;
        createdAt = circle.createdAt;
        memberCount = uint16(_members[circleId].length);
        closed = circle.closed;
        openExpenses = circle.openExpenses;
    }

    function membersOf(uint256 circleId) external view returns (address[] memory) {
        _existing(circleId);
        return _members[circleId];
    }

    function circlesOf(address account) external view returns (uint256[] memory) {
        return _joined[account];
    }

    function snapshot(uint256 circleId) external view returns (address[] memory members, int256[] memory nets) {
        _existing(circleId);
        return _loadNets(circleId);
    }

    function expenseCount(uint256 circleId) external view returns (uint256) {
        _existing(circleId);
        return _expenses[circleId].length;
    }

    function listExpenses(uint256 circleId, uint256 offset, uint256 limit)
        external
        view
        returns (ExpenseView[] memory page)
    {
        _existing(circleId);
        if (limit > MAX_PAGE) limit = MAX_PAGE;
        uint256 length = _expenses[circleId].length;
        if (offset >= length || limit == 0) return new ExpenseView[](0);
        uint256 end = offset + limit;
        if (end > length) end = length;

        page = new ExpenseView[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            page[i - offset] = _expenseView(circleId, i);
        }
    }

    function _expenseView(uint256 circleId, uint256 expenseId) internal view returns (ExpenseView memory item) {
        Expense storage expense = _expenses[circleId][expenseId];
        address[] memory participants = _participants[circleId][expenseId];
        uint256 participantCount = participants.length;
        uint256 confirmedCount = 0;
        for (uint256 p = 0; p < participantCount; ++p) {
            if (confirmed[circleId][expenseId][participants[p]]) confirmedCount += 1;
        }
        address[] memory confirmedBy = new address[](confirmedCount);
        uint256 cursor = 0;
        for (uint256 p = 0; p < participantCount; ++p) {
            if (confirmed[circleId][expenseId][participants[p]]) {
                confirmedBy[cursor] = participants[p];
                cursor += 1;
            }
        }
        item.id = expenseId;
        item.payer = expense.payer;
        item.amount = expense.amount;
        item.timestamp = expense.timestamp;
        item.confirmations = expense.confirmations;
        item.participantCount = expense.participantCount;
        item.applied = expense.applied;
        item.cancelled = expense.cancelled;
        item.memo = expense.memo;
        item.participants = participants;
        item.shares = _shares[circleId][expenseId];
        item.confirmedBy = confirmedBy;
    }

    function _apply(uint256 circleId, uint256 expenseId, address payer, uint128 amount) internal {
        address[] storage participants = _participants[circleId][expenseId];
        uint128[] storage shares = _shares[circleId][expenseId];
        uint256 count = participants.length;
        for (uint256 i = 0; i < count; ++i) {
            netOf[circleId][participants[i]] -= int256(uint256(shares[i]));
        }
        netOf[circleId][payer] += int256(uint256(amount));
    }

    function _clearPending(uint256 circleId, uint256 expenseId) internal {
        address[] storage participants = _participants[circleId][expenseId];
        uint256 count = participants.length;
        for (uint256 i = 0; i < count; ++i) {
            pendingTouches[circleId][participants[i]] -= 1;
        }
        _circles[circleId].openExpenses -= 1;
    }

    function _pull(address from, address to, uint256 amount) internal {
        uint256 allowed = usdc.allowance(from, address(this));
        if (allowed < amount) revert AllowanceTooLow(from, amount, allowed);
        uint256 debtorBalance = usdc.balanceOf(from);
        if (debtorBalance < amount) revert BalanceTooLow(from, amount, debtorBalance);

        uint256 creditorBefore = usdc.balanceOf(to);
        bool ok = usdc.transferFrom(from, to, amount);
        if (!ok) revert TransferFailed();
        if (usdc.balanceOf(to) < creditorBefore + amount) revert TransferFailed();
    }

    function _addMember(uint256 circleId, address account) internal {
        if (isMember[circleId][account]) revert AlreadyMember();
        if (_members[circleId].length >= MAX_MEMBERS) revert CircleFull();
        isMember[circleId][account] = true;
        _members[circleId].push(account);
        _joined[account].push(circleId);
        emit Joined(circleId, account);
    }

    function _removeMember(uint256 circleId, address account) internal {
        isMember[circleId][account] = false;
        address[] storage members = _members[circleId];
        uint256 count = members.length;
        for (uint256 i = 0; i < count; ++i) {
            if (members[i] == account) {
                members[i] = members[count - 1];
                members.pop();
                break;
            }
        }
        uint256[] storage joined = _joined[account];
        uint256 joinedCount = joined.length;
        for (uint256 i = 0; i < joinedCount; ++i) {
            if (joined[i] == circleId) {
                joined[i] = joined[joinedCount - 1];
                joined.pop();
                break;
            }
        }
    }

    function _loadNets(uint256 circleId) internal view returns (address[] memory members, int256[] memory nets) {
        members = _members[circleId];
        nets = new int256[](members.length);
        for (uint256 i = 0; i < members.length; ++i) {
            nets[i] = netOf[circleId][members[i]];
        }
    }

    function _plan(address[] memory members, int256[] memory nets) internal pure returns (Leg[] memory) {
        uint256 count = members.length;
        Leg[] memory buffer = new Leg[](count * count);
        uint256 wrote = 0;
        for (uint256 debtor = 0; debtor < count; ++debtor) {
            if (nets[debtor] >= 0) continue;
            for (uint256 creditor = 0; creditor < count && nets[debtor] < 0; ++creditor) {
                if (nets[creditor] <= 0) continue;
                uint256 debt = uint256(-nets[debtor]);
                uint256 credit = uint256(nets[creditor]);
                uint256 amount = debt < credit ? debt : credit;
                nets[debtor] += int256(amount);
                nets[creditor] -= int256(amount);
                buffer[wrote] = Leg(members[debtor], members[creditor], amount);
                wrote += 1;
            }
        }
        Leg[] memory legs = new Leg[](wrote);
        for (uint256 i = 0; i < wrote; ++i) {
            legs[i] = buffer[i];
        }
        return legs;
    }

    function _isParticipant(uint256 circleId, uint256 expenseId, address account) internal view returns (bool) {
        address[] storage participants = _participants[circleId][expenseId];
        uint256 count = participants.length;
        for (uint256 i = 0; i < count; ++i) {
            if (participants[i] == account) return true;
        }
        return false;
    }

    function _existing(uint256 circleId) internal view returns (Circle storage circle) {
        circle = _circles[circleId];
        if (circle.creator == address(0)) revert UnknownCircle();
    }

    function _expense(uint256 circleId, uint256 expenseId) internal view returns (Expense storage expense) {
        _existing(circleId);
        if (expenseId >= _expenses[circleId].length) revert UnknownExpense();
        expense = _expenses[circleId][expenseId];
    }
}
