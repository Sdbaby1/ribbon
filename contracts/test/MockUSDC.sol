// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Test double for the Arc USDC ERC-20 interface (6 decimals).
contract MockUSDC {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public immutable decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public virtual returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @notice Returns true and moves no funds.
contract LyingUSDC is MockUSDC {
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return true;
    }
}

/// @notice Returns false after the balance check in Ribbon would have passed.
contract FalseUSDC is MockUSDC {
    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

interface IRibbonPay {
    function pay(uint256 circleId, address creditor, uint256 amount) external;
}

/// @notice Attempts to re-enter Ribbon.pay during a settlement pull.
contract ReenteringUSDC is MockUSDC {
    address public ribbon;
    uint256 public circleId;
    address public creditor;
    bool public armed;

    function arm(address ribbon_, uint256 circleId_, address creditor_) external {
        ribbon = ribbon_;
        circleId = circleId_;
        creditor = creditor_;
        armed = true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool ok = super.transferFrom(from, to, amount);
        if (armed) {
            armed = false;
            IRibbonPay(ribbon).pay(circleId, creditor, 1);
        }
        return ok;
    }
}
