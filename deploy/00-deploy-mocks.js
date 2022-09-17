const { developmentChains, networkConfig } = require("../helper-hardhat-config");

const BASE_FEE = ethers.utils.parseEther("0.25"); // link price per RNG generation
const GAS_PRICE_LINK = 1e9; //10 gwei

module.exports = async function ({ getNamedAccounts, deployments }) {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const args = [BASE_FEE, GAS_PRICE_LINK];

    if (developmentChains.includes(network.name)) {
        console.log("Local network detected. Deploying mocks...");
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: args,
        });
        console.log(`Mocks deployed to chain: ${network.name}`);
        console.log("---------------------------------------------------------");
    };
};

module.exports.tags = ["all", "mocks"];