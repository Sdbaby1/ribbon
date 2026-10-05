import fs from "node:fs";
import path from "node:path";
import { ethers, network } from "hardhat";

const CANONICAL_USDC = "0x3600000000000000000000000000000000000000";
const FEE_FLOOR = 20_000_000_000n;

async function main() {
  const chainId = Number(network.config.chainId);
  const usdcAddress = ethers.getAddress(process.env.USDC_ADDRESS?.trim() || CANONICAL_USDC);
  const code = await ethers.provider.getCode(usdcAddress);
  if (code === "0x") {
    throw new Error(`No contract code at ${usdcAddress} on chain ${chainId}.`);
  }

  const token = await ethers.getContractAt(["function decimals() view returns (uint8)"], usdcAddress);
  const decimals = Number(await token.decimals());
  if (decimals !== 6) {
    throw new Error(
      `decimals() at ${usdcAddress} returned ${decimals}. Ribbon settles the 6-decimal ERC-20 USDC interface, not the 18-decimal native balance.`,
    );
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account. Set DEPLOYER_PRIVATE_KEY.");
  const balance = await ethers.provider.getBalance(deployer.address);
  if (balance === 0n) {
    throw new Error(`${deployer.address} has no USDC for gas. Arc charges gas in USDC.`);
  }

  const fee = await ethers.provider.getFeeData();
  let maxFeePerGas = fee.maxFeePerGas ?? fee.gasPrice ?? FEE_FLOOR;
  if (maxFeePerGas < FEE_FLOOR) maxFeePerGas = FEE_FLOOR;

  console.log(`Network ${network.name} chain ${chainId}`);
  console.log(`Deployer ${deployer.address}`);
  console.log(`USDC ${usdcAddress}`);
  console.log(`maxFeePerGas ${maxFeePerGas.toString()} (priority fee 0)`);

  const Ribbon = await ethers.getContractFactory("Ribbon");
  const ribbon = await Ribbon.deploy(usdcAddress, {
    maxFeePerGas,
    maxPriorityFeePerGas: 0n,
  });
  await ribbon.waitForDeployment();
  const address = await ribbon.getAddress();
  const deploymentTx = ribbon.deploymentTransaction();

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const record = {
    chainId,
    ribbon: address,
    usdc: usdcAddress,
    deployer: deployer.address,
    txHash: deploymentTx?.hash ?? null,
    deployedAt: new Date().toISOString(),
  };
  const file = path.join(outDir, `${chainId}.json`);
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);

  const explorer = chainId === 5042 ? "https://explorer.arc.io" : "https://explorer.testnet.arc.io";
  console.log("");
  console.log(`Ribbon deployed at ${address}`);
  console.log(`${explorer}/address/${address}`);
  console.log(`${explorer}/tx/${deploymentTx?.hash ?? ""}`);
  console.log("");
  if (chainId !== 5042) {
    console.log("Arc Microgrants does not accept a testnet-only project.");
    console.log("This command is a rehearsal. Submit a deployment from: npm run deploy:arc");
  }
  console.log("Put these in the environment, then rebuild the web app:");
  console.log(`VITE_RIBBON_ADDRESS=${address}`);
  console.log(`RIBBON_ADDRESS=${address}`);
  console.log(`USDC_ADDRESS=${usdcAddress}`);
  console.log(`Wrote ${file}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
