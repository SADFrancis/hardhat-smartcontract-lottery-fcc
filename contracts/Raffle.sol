// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// Raffle
// Enter the lottery by paying some amount
// Pick a random winner
// Winner to be chosen every X span of time

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";

error Raffle__NotEnoughETHEntered();
error Raffle__WinnerBalanceTransferFailed();
error Raffle__RaffleCurrentlyClosed();
error Raffle__UpkeepConditionsNotMet(uint256 RaffleState, uint256 numOfPlayers, uint256 balanceOfAddress );

/** @title A sample Raffle Contract
 *  @author Sean Francis
 *  @notice Contract to demonstrate how to create an untamperable Lottery
 *  @dev This implements Chainlink VRF V2 and Keepers
 * 
 */

contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
    /* Type Declarations */
    enum RaffleState {
        OPEN, 
        CALCULATING
    }

    /* State Variables */
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;


    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    bytes32 private immutable i_gasLane;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint16 private constant NUM_WORDS =1;
    
    /* Lottery Variables */
    address private s_recentWinner;
    RaffleState private s_raffleState;
    uint256 private s_lastTimeStamp;
    uint256 private immutable i_interval;
    
    /* Events */
    event RaffleEnter(address indexed player);
    event RequestedRandomWinner(uint256 indexed requestId);
    event WinnerPicked(address indexed winner);


    /* Functions */
    constructor(
        address vrfCoordinatorV2, 
        uint256 entranceFee, 
        bytes32 keyhash,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval) VRFConsumerBaseV2(vrfCoordinatorV2)
    {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = keyhash;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;

    }



    function enterRaffle()public payable{
        // require(msg.value > i_entranceFee, "Spend more ETH");
        if(s_raffleState != RaffleState.OPEN){revert Raffle__RaffleCurrentlyClosed();}
        if(msg.value < i_entranceFee){revert Raffle__NotEnoughETHEntered(); }
        
        s_players.push(payable(msg.sender));

        // Events
        // Emit event when we update a dynamic array or mapping
        // Named events with function name reversed
        emit RaffleEnter(msg.sender);
    }

    function performUpkeep(bytes calldata /* performData */) external override{
        // Request Random Number
        // Do something with it

        (bool upkeepNeeded,) = checkUpkeep("");
        if(!upkeepNeeded){
            revert Raffle__UpkeepConditionsNotMet
            (
                uint256(s_raffleState),
                s_players.length, 
                address(this).balance
            );
        }

        s_raffleState = RaffleState.CALCULATING;
        
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane, //gaslane
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedRandomWinner(requestId);
    }

    /** 
    * @dev This is the function that Chainlink Keeper nodes call
    * They look for upkeepNeed to perform true;
    * Conditions to be true:
    * 1. Time interval should have passed
    * 2. Lottery player count > 0 
    * 3. Balance > 0
    * 4. subscription funded with Link
    * 5. Lottery should be open
    
    * Initial argument parameter bytes calldata is changed to bytes memory for
    * first Bool comparison in performUpkeep function
    */

    function checkUpkeep(bytes memory /* checkData */) 
        public 
        view 
        override 
        returns (bool upkeepNeeded, bytes memory /* performData */) 
    {
        bool isOpen = (s_raffleState == RaffleState.OPEN);
        bool hasPlayers = (s_players.length > 0);
        bool isFunded = (address(this).balance > 0);
        bool intervalPassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        
        upkeepNeeded = (isOpen && hasPlayers && isFunded && intervalPassed);
        
        // We don't use the checkData in this example. The checkData is defined when the Upkeep was registered.
    }
    function fulfillRandomWords(uint256 /*requestId*/, uint256[] memory randomWords) 
        internal 
        override 
    {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner]; 
        s_recentWinner = recentWinner;
        s_players = new address payable[](0);
        s_raffleState = RaffleState.OPEN;
        s_lastTimeStamp = block.timestamp;
        (bool success,) = recentWinner.call{value: address(this).balance}("");
        if (!success){
            revert Raffle__WinnerBalanceTransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    /* View/Pure Functions */
    function getEntranceFee()public view returns(uint256){
        return i_entranceFee;
    }

    function getPlayerByIndex(uint256 index) public view returns(address){
        return s_players[index];
    }

    function getNumOfPlayers() public view returns(uint256){
        return s_players.length;
    }

    function getVRFInterface() public view returns (VRFCoordinatorV2Interface){
        return i_vrfCoordinator;
    }

    function getGasLane() public view returns (bytes32) {
        return i_gasLane;
    }
    function getSubscriptionId() public view returns (uint64) {
        return i_subscriptionId;
    }    
    function getRequestConfirmations() public pure returns (uint16) {
        // pure versus view
        // pure isn't retained in storage, they'll read the number from the 
        // initial declaration, saving gas
        return REQUEST_CONFIRMATIONS;
    }
    function getCallbackGasLimit() public view returns (uint32) {
        return i_callbackGasLimit;
    }    
    function getNumWords() public pure returns (uint16) {
        return NUM_WORDS;
    }
    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }
    function getRaffleState() public view returns (RaffleState){
        return s_raffleState;
    }
    function getLastTimeStamp() public view returns (uint256){
        return s_lastTimeStamp;
    }

    function getInterval() public view returns (uint256){
        return i_interval;
    }
}