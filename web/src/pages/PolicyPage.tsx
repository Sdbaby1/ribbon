import { Link } from "react-router-dom";

const EFFECTIVE_DATE = "October 8, 2026";

function PolicyHeader({ title, summary }: { title: string; summary: string }) {
  return (
    <header className="policy-header">
      <Link to="/">Back to Ribbon</Link>
      <h1>{title}</h1>
      <p className="lede">{summary}</p>
      <p className="fine">Effective {EFFECTIVE_DATE}</p>
    </header>
  );
}

export function PrivacyPage() {
  return (
    <article className="policy">
      <PolicyHeader title="Privacy Policy" summary="What Ribbon processes when you connect a wallet, use a circle, or save an optional display name." />

      <section>
        <h2>Information Ribbon processes</h2>
        <p>
          You can browse the site without creating an account. When you connect a wallet, Ribbon reads your public wallet
          address and onchain Ribbon data. If you save a display name, Ribbon stores that name with your public wallet
          address and an update time in Supabase. Your signed message is used to verify the request and is not stored.
        </p>
        <p>
          Creating or using a circle publishes transaction information to Arc, including wallet addresses, circle
          membership, expense notes, amounts, confirmations, and settlements. Blockchain records are public and cannot be
          deleted by Ribbon.
        </p>
      </section>

      <section>
        <h2>Why the information is used</h2>
        <p>
          Ribbon uses this information to show your circles, verify optional profile updates, calculate balances, submit
          transactions you approve in your wallet, prevent unauthorized profile changes, and keep the service reliable.
        </p>
      </section>

      <section>
        <h2>Local browser storage</h2>
        <p>
          Ribbon stores circle IDs and invite codes in your browser so you can return to them on the same device. The wallet
          connection library can also remember your connection choice. See the <Link to="/cookies">Cookies Policy</Link> for
          details and removal instructions.
        </p>
      </section>

      <section>
        <h2>Service providers</h2>
        <p>
          Vercel hosts the site and API. Supabase stores optional display names. Arc RPC providers receive the technical
          requests needed to read and submit blockchain data. Your wallet provider processes connection and transaction
          requests under its own terms. Ribbon does not use advertising or analytics services and does not sell personal data.
        </p>
      </section>

      <section>
        <h2>Retention and your choices</h2>
        <p>
          Local data remains until you clear this site's browser storage. An optional display name remains until it is
          replaced or deleted from the profile database. You may use a shortened or non-identifying display name. Public
          blockchain records remain on Arc and cannot be changed or erased by Ribbon.
        </p>
      </section>

      <section>
        <h2>Security, children, and changes</h2>
        <p>
          Ribbon uses signed messages to authorize profile changes and keeps the Supabase service credential on the server.
          No online service can promise perfect security. Ribbon is not directed to children. Material policy changes will
          be posted here with a revised effective date.
        </p>
      </section>

      <section>
        <h2>Questions and requests</h2>
        <p>
          Open an issue in the <a href="https://github.com/Sdbaby1/ribbon/issues">Ribbon GitHub repository</a> for privacy
          questions or requests. GitHub issues are public, so do not include private keys, invite codes, signatures, or other
          sensitive information.
        </p>
      </section>
    </article>
  );
}

export function TermsPage() {
  return (
    <article className="policy">
      <PolicyHeader title="Terms and Conditions" summary="Rules for using Ribbon and its Arc smart contract." />

      <section>
        <h2>Using Ribbon</h2>
        <p>
          By using Ribbon, you agree to these terms. You must be able to enter a binding agreement where you live and must
          use Ribbon only for lawful purposes. Do not use the service to mislead others, interfere with the site, or violate
          another person's rights.
        </p>
      </section>

      <section>
        <h2>Your wallet and transactions</h2>
        <p>
          You control your wallet, private keys, approvals, and transactions. Review every wallet prompt before signing.
          Ribbon cannot recover a wallet, reverse an Arc transaction, restore a lost private key, or remove information from
          the blockchain. Circle invites should be shared only with people you trust.
        </p>
      </section>

      <section>
        <h2>What Ribbon provides</h2>
        <p>
          Ribbon is software for recording agreed shared expenses and settling resulting balances in USDC. Ribbon does not
          hold customer funds, provide financial advice, guarantee repayment, or decide whether an expense is valid. Circle
          members are responsible for checking names, participants, amounts, shares, token approvals, and recipient addresses.
        </p>
      </section>

      <section>
        <h2>Availability and risk</h2>
        <p>
          The service and smart contract are provided as available. Blockchain networks, wallets, RPC services, hosting, and
          databases can fail or change. Smart contracts and digital assets involve technical and financial risk. You are
          responsible for deciding whether Ribbon is suitable for a transaction and for any taxes or reporting that apply.
        </p>
      </section>

      <section>
        <h2>Liability</h2>
        <p>
          To the extent allowed by law, Ribbon's maintainers are not liable for indirect, incidental, special, consequential,
          or punitive loss arising from use of the service, lost keys, user error, third-party services, network behavior, or
          smart-contract activity. Rights that cannot lawfully be excluded remain unaffected.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          These terms may change as Ribbon develops. Changes will appear on this page with a revised effective date. Questions
          can be raised in the <a href="https://github.com/Sdbaby1/ribbon/issues">Ribbon GitHub repository</a>. Do not post
          private keys, invite codes, signatures, or other sensitive information in a public issue.
        </p>
      </section>
    </article>
  );
}

export function CookiesPage() {
  return (
    <article className="policy">
      <PolicyHeader title="Cookies Policy" summary="Ribbon uses limited browser storage to make wallet and circle features work." />

      <section>
        <h2>What Ribbon stores</h2>
        <p>
          Ribbon does not set advertising or analytics cookies. It uses browser local storage to remember circle IDs you have
          opened, invite codes you chose to keep on the device, and wallet connection state. This information is necessary to
          return you to saved circles and maintain the connection choice you requested.
        </p>
      </section>

      <section>
        <h2>Third-party services</h2>
        <p>
          Ribbon does not load third-party advertising, analytics, video, social media, or font embeds. Vercel may process
          request and security information when it delivers the site. Your wallet may use its own storage when you connect;
          check the wallet provider's policy for details.
        </p>
      </section>

      <section>
        <h2>Managing storage</h2>
        <p>
          You can clear Ribbon's data in your browser's site-data or privacy settings. Clearing it removes locally remembered
          circle IDs, invite codes, and wallet connection state. Onchain circle records remain public, and you may need the
          original invite or creation transaction to restore access to an invite on that device.
        </p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>
          Changes will appear here with a revised effective date. Questions can be raised in the{" "}
          <a href="https://github.com/Sdbaby1/ribbon/issues">Ribbon GitHub repository</a>. Do not include secrets in a public issue.
        </p>
      </section>
    </article>
  );
}
