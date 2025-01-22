// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract PurchasesTracking {
    using SafeERC20 for IERC20;

    address public owner;
    IERC20 public paymentToken;

    struct Purchase {
        uint256 amount;
        address buyer;
        bool isSplit;
        address[] buyers;
        uint256[] userContributions;
    }

    mapping(uint => Purchase) public purchases;
    uint public purchaseCount;

    event PurchaseAdded(
        uint purchaseId,
        uint amount,
        address[] buyers,
        uint[] userContributions
    );
    event PurchaseDeleted(uint purchaseId);
    event FundsWithdrawn(uint amount);

    constructor(address _paymentToken) {
        owner = msg.sender;
        paymentToken = IERC20(_paymentToken);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can execute this");
        _;
    }

    function addPurchase(
        uint amount,
        address[] memory buyers,
        uint[] memory userContributions
    ) public {
        if (buyers.length == 0) {
            paymentToken.safeTransferFrom(msg.sender, address(this), amount);

            address[] memory emptyAddresses = new address[](0);
            uint[] memory emptyContributions = new uint[](0);

            purchases[purchaseCount] = Purchase({
                amount: amount,
                buyer: msg.sender,
                buyers: emptyAddresses,
                userContributions: emptyContributions,
                isSplit: false
            });
        } else {
            require(
                buyers.length == userContributions.length,
                "Buyers and contributions arrays must match"
            );

            uint totalContributions = 0;
            for (uint i = 0; i < userContributions.length; i++) {
                require(buyers[i] != address(0), "Invalid buyer address");
                totalContributions += userContributions[i];
            }

            require(
                totalContributions == amount,
                "Total contributions must match amount"
            );

            for (uint i = 0; i < buyers.length; i++) {
                uint contribution = userContributions[i];
                paymentToken.safeTransferFrom(
                    buyers[i],
                    address(this),
                    contribution
                );
            }

            purchases[purchaseCount] = Purchase({
                amount: amount,
                buyer: address(0),
                buyers: buyers,
                userContributions: userContributions,
                isSplit: true
            });
        }

        emit PurchaseAdded(purchaseCount, amount, buyers, userContributions);
        purchaseCount++;
    }

    function removePurchase(uint purchaseId) public onlyOwner {
        require(purchaseId < purchaseCount, "Purchase does not exist");

        delete purchases[purchaseId];
        emit PurchaseDeleted(purchaseId);
    }

    function withdraw(uint amount) public onlyOwner {
        require(
            paymentToken.balanceOf(address(this)) >= amount,
            "Insufficient token balance in contract"
        );

        paymentToken.safeTransfer(msg.sender, amount);
        emit FundsWithdrawn(amount);
    }

    function getPurchaseBuyers(
        uint purchaseId
    ) public view returns (address[] memory) {
        require(purchaseId < purchaseCount, "Purchase does not exist");
        return purchases[purchaseId].buyers;
    }

    function getPurchaseUserContributions(
        uint purchaseId
    ) public view returns (uint256[] memory) {
        require(purchaseId < purchaseCount, "Purchase does not exist");
        return purchases[purchaseId].userContributions;
    }
}
