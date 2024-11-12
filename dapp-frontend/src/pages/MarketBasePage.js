import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import TicketMarketplaceABI from '../contracts/TicketMarketplace.json';
import EventTicketSystemABI from '../contracts/EventTicketSystem.json';
import EventFactoryABI from '../contracts/EventFactory.json';
import Web3 from 'web3';

const MARKETPLACE_ADDRESS = '0x4b0864e55616b4aa2bFeFAedDA73c01565651033';
const eventFactoryAddress = '0x1920De7F459cb722Ba31D7eeD05B1a4f05D23e7e';

const MarketBasePage = () => {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [nfts, setNfts] = useState([]);
    const [selectedNft, setSelectedNft] = useState({ contractAddress: '', tokenId: '' });
    const [price, setPrice] = useState('');

    useEffect(() => {
        // Load wallet and marketplace data when component mounts
        const loadWalletData = async () => {
            try {
                const web3 = new Web3(window.ethereum);
                const accounts = await web3.eth.getAccounts();
                const user = accounts[0];

                const eventFactory = new web3.eth.Contract(EventFactoryABI.abi, eventFactoryAddress);
                const events = await eventFactory.methods.getDeployedEvents().call();

                const ownedTicketsData = await fetchOwnedTickets(web3, events, user);
                setNfts(ownedTicketsData);

                await loadListings(web3);
            } catch (error) {
                console.error('Error fetching wallet data:', error);
                alert("Failed to load wallet data. Please ensure MetaMask is connected.");
            } finally {
                setLoading(false);
            }
        };

        loadWalletData();
    }, []);

    // Load active listings with event names and prices
    const loadListings = async (web3) => {
        try {
            const contract = new web3.eth.Contract(TicketMarketplaceABI.abi, MARKETPLACE_ADDRESS);
            const items = await contract.methods.getAllActiveListings().call();

            const transformedListings = await Promise.all(
                items.map(async ({ nftContract, tokenId }) => {
                    let priceInWei = '0';
                    let eventName = '';

                    try {
                        const listingData = await contract.methods.listings(nftContract, tokenId).call();

                        if (!listingData.isActive) return null;

                        priceInWei = listingData.price;
                        //const price = web3.utils.fromWei(priceInWei, 'ether');
                        const price = parseFloat(web3.utils.fromWei(priceInWei, 'ether')).toString();

                        

                        const eventContract = new web3.eth.Contract(EventTicketSystemABI.abi, nftContract);
                        eventName = await eventContract.methods.name().call();

                        return {
                            contractAddress: nftContract,
                            tokenId,
                            price,
                            eventName,
                        };
                    } catch (error) {
                        console.error(`Error fetching details for contract: ${nftContract}, Token ID: ${tokenId}`, error);
                        return null;
                    }
                })
            );

            setListings(transformedListings.filter(Boolean));
        } catch (error) {
            console.error("Error loading listings:", error);
            alert("Error loading listings, please try again later.");
        }
    };

    // Fetch owned tickets for the connected user
    const fetchOwnedTickets = async (web3, events, user) => {
        const tickets = [];

        for (const eventAddress of events) {
            try {
                const contract = new web3.eth.Contract(EventTicketSystemABI.abi, eventAddress);
                const totalMinted = await contract.methods.ticketsMinted().call();
                const eventName = await contract.methods.name().call();

                for (let ticketId = 1; ticketId <= totalMinted; ticketId++) {
                    const owner = await contract.methods.ownerOf(ticketId).call();
                    if (owner.toLowerCase() === user.toLowerCase()) {
                        tickets.push({ eventAddress, tokenId: ticketId, eventName });
                    }
                }
            } catch (error) {
                console.error(`Error fetching tickets for event: ${eventAddress}`, error);
            }
        }

        return tickets;
    };

    // Handle listing an NFT
    const handleListNft = async () => {
        if (!selectedNft.contractAddress || !selectedNft.tokenId || !price) {
            alert("Please fill in all fields.");
            return;
        }

        try {
            const web3 = new Web3(window.ethereum);
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            const currentAccount = accounts[0];

            const contract = new web3.eth.Contract(TicketMarketplaceABI.abi, MARKETPLACE_ADDRESS);
            const priceInWei = web3.utils.toWei(price, 'ether');
            

            await contract.methods.listTicket(selectedNft.contractAddress, selectedNft.tokenId, priceInWei).send({ from: currentAccount });
            alert("Ticket listed successfully!");
            await loadListings(web3);
        } catch (error) {
            console.error("Error listing ticket:", error);
            alert("Transaction failed! Please check console for details.");
        }
    };


    // Function to handle buy action
    const handleBuy = async (item) => {
        try {
            const web3 = new Web3(window.ethereum);
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            const currentAccount = accounts[0];

            const contract = new web3.eth.Contract(TicketMarketplaceABI.abi, MARKETPLACE_ADDRESS);

            // Check if price is a valid number
            const priceInEth = parseFloat(item.price); // Convert to a number for comparison

            // Handle extremely small prices
            if (isNaN(priceInEth) || priceInEth <= 0) {
                alert("Invalid ticket price.");
                return;
            }

            // Minimum price threshold (for example, 0.0001 ETH)
            const minPriceThreshold = 0.0001;

            if (priceInEth < minPriceThreshold) {
                alert(`The price of the ticket is too low to process the transaction.`);
                return;
            }

            // Convert price to Wei
            const priceInWei = web3.utils.toWei(priceInEth.toString(), 'ether'); 

            // Call buyTicket with the contract address and tokenId
            await contract.methods.buyTicket(item.contractAddress, item.tokenId).send({
                from: currentAccount,
                value: priceInWei
            });

            alert("Ticket purchased successfully!");
            loadListings(web3); // Reload listings after purchase
        } catch (error) {
            console.error("Error purchasing ticket:", error);
            alert("Transaction failed! Please check console for details.");
        }
    };



    return (
        <div className="container">
            <Navbar />
            <h1>Marketplace</h1>
            {loading ? (
                <p>Loading listings...</p>
            ) : (
                <>
                    <h2>Current Listings</h2>
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Event</th>
                                <th>Price (ETH)</th>
                                <th>Buy</th>
                            </tr>
                        </thead>
                        <tbody>
                            {listings.map((item, index) => (
                                <tr key={index}>
                                    <td>{item.eventName || item.contractAddress}</td>
                                    <td>{item.price} ETH</td>
                                    <td>
                                        <button className="btn btn-primary" onClick={() => handleBuy(item)}>Buy</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <h2>List Your NFT</h2>
                    <div>
                        <label htmlFor="nftDropdown">Select NFT:</label>
                        <select
                            id="nftDropdown"
                            onChange={(e) => {
                                const selected = nfts[e.target.value];
                                setSelectedNft({ contractAddress: selected.eventAddress, tokenId: selected.tokenId });
                            }}
                        >
                            <option value="">Select NFT</option>
                            {nfts.map((nft, index) => (
                                <option key={index} value={index}>
                                    {nft.eventName} (Token ID: {nft.tokenId})
                                </option>
                            ))}
                        </select>

                        <div>
                            <label htmlFor="price">Price (ETH):</label>
                            <input
                                type="text"
                                id="price"
                                value={price}
                                onChange={(e) => setPrice(e.target.value)}
                                placeholder="Enter price in ETH"
                            />
                        </div>
                        <button onClick={handleListNft}>List NFT</button>
                    </div>
                </>
            )}
        </div>
    );
};

export default MarketBasePage;