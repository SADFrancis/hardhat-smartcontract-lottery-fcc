const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config");

developmentChains.includes(network.name) // if we're not on development chain
    ? describe.skip // SKIP
    : describe("Raffle Staging Tests", function () {
        // time to do some tests on a local blockchain
        let raffle, raffleEntranceFee, deployer;

        beforeEach(async function () {
            //const { deployer } = await getNamedAccounts();
            deployer = (await getNamedAccounts()).deployer;
            // await deployments.fixture(["all"]); This will also run Mocks which aren't needed
            raffle = await ethers.getContract("Raffle", deployer);
            //vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
            raffleEntranceFee = await raffle.getEntranceFee();
            console.log(`Pulling contract from address: ${raffle.address}`);
        });

        describe("fulfillRandomWords", function () {

            it("S00 works with live Chainlink Keepers and VRF and get a random winner", async function () {
                // enter raffle
                const startingTimeStamp = await raffle.getLastTimeStamp();
                const accounts = await ethers.getSigners();

                console.log("Setting up Listener...")
                await new Promise(async (resolve, reject) => {
                    //set up listener to hear the event (only fires once a round) before we enter the raffle
                    raffle.once("WinnerPicked", async () => {
                        console.log("Winner Picked event fired!");
                        try {
                            // input asserts in try section
                            const recentWinner = await raffle.getRecentWinner();
                            const raffleState = await raffle.getRaffleState();
                            const endingTimeStamp = await raffle.getLastTimeStamp();
                            const winnerEndingBalance = await accounts[0].getBalance();
                            await expect(raffle.getPlayerByIndex(0)).to.be.reverted; // expect player array to reset
                            assert.equal(recentWinner.toString(), accounts[0].address);
                            assert.equal(raffleState, 0);
                            assert.equal(
                                winnerEndingBalance.toString(),
                                winnerStartingBalance.add(raffleEntranceFee).toString()
                            );
                            assert(endingTimeStamp > startingTimeStamp);
                            resolve();
                        } catch (error) {
                            console.log(error);
                            reject(error);                            
                        }
                    }); // Conclude event listener

                    // Then the entering the raffle
                    console.log("Entering Raffle...")
                    try {
                        const tx = await raffle.enterRaffle({ value: raffleEntranceFee });
                        await tx.wait(5);                    
                    }
                    catch (error) {
                        console.log(error);
                    }
                    console.log("Ok, time to wait...");
                    const winnerStartingBalance = await accounts[0].getBalance();
                }); // Conclude S00 Promise
            }); // Conclude S00 test if Live VRF + Keepers pays out to random winner
        }); // Conclude fulfill RandomWords Tests
    }); // Conclude Staging Test
