type SetupNoticeProps = {
  ribbonAddress: string | null;
};

export function SetupNotice({ ribbonAddress }: SetupNoticeProps) {
  if (ribbonAddress) return null;
  return (
    <section className="notice">
      <h2>Deploy Ribbon, then point the app at it</h2>
      <p>
        The ledger is the contract on Arc mainnet. This screen reads whatever address is in{" "}
        <code>VITE_RIBBON_ADDRESS</code>.
      </p>
      <ol>
        <li>Put a little USDC on the deployer. Arc charges gas in USDC.</li>
        <li>
          Run <code>npm run deploy:arc</code>.
        </li>
        <li>
          Copy the printed address into <code>VITE_RIBBON_ADDRESS</code> and <code>RIBBON_ADDRESS</code>.
        </li>
        <li>
          Rebuild with <code>npm run build</code> and start with <code>npm start</code>.
        </li>
      </ol>
    </section>
  );
}
