const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const { developmentChains, networkConfig } = require("../../helper-hardhat-config");

!developmentChains.includes(network.name) // if we're not on development chain
    ? describe.skip // SKIP
    : describe("Raffle Unit Tests", function () {
        // time to do some tests on a local blockchain
        let raffle, vrfCoordinatorV2Mock, raffleEntranceFee, deployer, interval;
        const chainId = network.config.chainId;

        beforeEach(async function () {
            //const { deployer } = await getNamedAccounts();
            deployer = (await getNamedAccounts()).deployer;
            await deployments.fixture(["all"]);
            raffle = await ethers.getContract("Raffle", deployer);
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
            raffleEntranceFee = await raffle.getEntranceFee();
            interval = await raffle.getInterval();

        });

        describe("constructor", function () {
            it("00 Initiallizes the raffle correctly", async function () {
                // Ideally we make our tests have just 1 assert per "it"
                const raffleState = await raffle.getRaffleState();
                assert.equal(raffleState.toString(), "0");
                assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
            });
        });

        describe("enterRaffle", function () {
            it("01 reverts when you don't pay enough", async function () {
                await expect(raffle.enterRaffle()).to.be.revertedWith(
                    "Raffle__NotEnoughETHEntered"
                );
            });

            it("02 records players when they enter", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                const playerFromContract = await raffle.getPlayerByIndex(0);
                assert.equal(playerFromContract, deployer);
            });

            it("03 emits event on enter", async function () {
                await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.emit(
                    raffle,
                    "RaffleEnter"
                );
            });

            it("04 doesn't allow entrance when raffle is calculating", async function () {
                // gonna copypaste this from the github, getting lazy
                
                await raffle.enterRaffle({ value: raffleEntranceFee })
                // for a documentation of the methods below, go here: https://hardhat.org/hardhat-network/reference
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                // await network.provider.send("evm_mine", []); // same as below
                await network.provider.request({ method: "evm_mine", params: [] })
                // we pretend to be a keeper for a second
                await raffle.performUpkeep([]) // changes the state to calculating for our comparison below
                await expect(raffle.enterRaffle({ value: raffleEntranceFee })).to.be.revertedWith( // is reverted as raffle is calculating
                    "Raffle__RaffleCurrentlyClosed"
                );
            }); // conclude it 04
        }); // conclude describe enterRaffle
        
        describe("checkUpkeep", function () {
            it("05 returns false if people haven't sent any funds", async function() {
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.send("evm_mine", []);
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
                assert(!upkeepNeeded);
            }); // conclude it 05


            it("06 returns false if raffle isn't open", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.send("evm_mine", []);
                await raffle.performUpkeep("0x"); // alternate method of sending blank bytes object
                const raffleState = await raffle.getRaffleState();
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);

                assert.equal(raffleState.toString(), "1");
                assert.equal(upkeepNeeded, false);            
            }); // conclude it 06

            // copypasted 07/08 with Professor's blessings
            it("07 returns false if enough time hasn't passed", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                await network.provider.request({ method: "evm_mine", params: [] })
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                assert(!upkeepNeeded)
            }) // conclude it 07

            it("08 returns true if enough time has passed, has players, eth, and is open", async () => {
                await raffle.enterRaffle({ value: raffleEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.request({ method: "evm_mine", params: [] })
                const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                assert(upkeepNeeded)
            }) // conlcude it 08

        }) // conlcude describe checkUpkeep
        
        describe("performUpkeep", function () {
            it("09 it can only run if checkupkeep is true", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.request({ method: "evm_mine", params: [] });
                const tx = await raffle.performUpkeep([]);
                assert(tx);
                  
            }); // conclude it 09

            it("10 reverts when checkupkeep is false", async function () {
                await expect(raffle.performUpkeep([])).to.be.revertedWith(
                    "Raffle__UpkeepConditionsNotMet"
                );
                  
            }); // conclude it 10

            it("11 updates the raffle state, emits an event, and calls the VRF Coordinator", async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.request({ method: "evm_mine", params: [] });
                const txResponse = await raffle.performUpkeep([]);
                const txReceipt = await txResponse.wait(1);
                const requestId = txReceipt.events[1].args.requestId;// VRFCoordinator emits an event then enterRaffle emits an event
                const raffleState = await raffle.getRaffleState();
                assert(requestId.toNumber() > 0);
                assert(raffleState.toString() == "1");
            });

        }); // conclude perform Upkeep

        describe("fulfillRandomWords", function () {
            beforeEach(async function () {
                await raffle.enterRaffle({ value: raffleEntranceFee });
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]);
                await network.provider.request({ method: "evm_mine", params: [] });     
            }); // conclude beforeEach staging

            it("12 Can only be called after performUpkeep", async function () {
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)).to.be.revertedWith("nonexistent request");
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)).to.be.revertedWith("nonexistent request");

            }); // conclude unit test 12

            it("13 Picks a winner, resets lottery, sends money", async function () {
                const additionalEntrants = 3;
                const startingAccountIndex = 1;
                const accounts = await ethers.getSigners();
                for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++){
                    const accountConnectedRaffle = raffle.connect(accounts[i]);
                    await accountConnectedRaffle.enterRaffle({ value: raffleEntranceFee });
                }
                const startingTimeStamp = await raffle.getLastTimeStamp();
                // performUpkeep (mock being Chainlinkkeepers)
                // fulfill RandomWords (mock VRF)
                // wait for VRF to return output

                await new Promise(async (resolve, reject) => {
                    raffle.once("WinnerPicked", async () => {
                        console.log("Winner has been picked!");
                        try {
                            const recentWinner = await raffle.getRecentWinner();
                            console.log(`recentWinner is ${recentWinner}`);
                            console.log(`account 0 is ${accounts[0].address}`);
                            console.log(`account 1 is ${accounts[1].address}`);
                            console.log(`account 2 is ${accounts[2].address}`);
                            console.log(`account 3 is ${accounts[3].address}`);
                            const raffleState = await raffle.getRaffleState();
                            const endingTimeStamp = await raffle.getLastTimeStamp();
                            const numPlayers = await raffle.getNumOfPlayers();
                            const winnerEndingBalance = await accounts[1].getBalance();
                            assert.equal(numPlayers.toString(), "0"); //s_players has reset
                            assert.equal(raffleState.toString(), "0"); // raffleState back to Open
                            assert(endingTimeStamp > startingTimeStamp);
                            assert.equal(winnerEndingBalance.toString(),
                                winnerStartingBalance.add(
                                    raffleEntranceFee
                                    .mul(additionalEntrants)
                                    .add(raffleEntranceFee)
                                    .toString()
                                )
                            );
                        } catch (e) {
                            reject(e);
                        };
                        resolve();
                    });
                    // set up listener above
                    // fire the event below and the lister with pick it up and resolve
                    
                    // winnerStartingBalance is used in the promise so must be defined outside the try/catch
                    const winnerStartingBalance = await accounts[1].getBalance();                    
                    try {
                        const tx = await raffle.performUpkeep("0x");
                        //console.log("tx");
                        //console.log(tx);
                        //console.log("----------------------------------------------------------")
                        const txReceipt = await tx.wait(1);
                        //console.log("receipt");
                        //console.log(txReceipt);
                        //console.log("----------------------------------------------------------")
                        //console.log(`requestId is: ${txReceipt.events[1].args.s_requestId}`); // forgot the s_, changed from s_requestId to requestId in contract
                        //console.log(`Consumer address is: ${raffle.address}`);
                        await vrfCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          raffle.address                     
                            ); // will emit event to resolve event WinnerPicked
                        } catch (e) {
                        console.log(e);
                    }


                }) // complete promise


            }); // conclude unit test 13

        }); // conclude Fulfill Random Words

    }); // Conclude development chain unit tests