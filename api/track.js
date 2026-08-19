const axios = require('axios');

// Replace with your exact Firebase Realtime DB URL
const FIREBASE_URL = "https://nexa-payments-default-rtdb.asia-southeast1.firebasedatabase.app";

// XOR Encryption exactly like the Python Bot
function encryptPayload(dataStr, key = 'gateway') {
    let encryptedBytes = [];
    for (let i = 0; i < dataStr.length; i++) {
        let charCode = dataStr.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        encryptedBytes.push(charCode);
    }
    return Buffer.from(encryptedBytes).toString('base64');
}

export default async function handler(req, res) {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: "Missing ID" });

    try {
        // 1. Fetch Credentials from Firebase
        const fbRes = await axios.get(FIREBASE_URL);
        const adminData = fbRes.data;
        if (!adminData || !adminData.phone) {
            return res.status(500).json({ success: false, error: "System not configured. Go to /login.html" });
        }

        const session = axios.create({
            headers: {
                "User-Agent": "Mozilla/5.0",
                "X-Requested-With": "XMLHttpRequest"
            }
        });

        // 2. Perform Login to generate Session Cookies
        const rawPayload = JSON.stringify({
            action: "login_verify",
            timestamp: Date.now(),
            data: { walletNumber: adminData.phone, password: adminData.password, remember: "yes" }
        });
        
        const loginPayload = { payload: encryptPayload(rawPayload) };
        
        const loginRes = await session.post("https://ultra-pay.in/loghandler.php", loginPayload, {
            headers: { "Content-Type": "application/json", "Referer": "https://ultra-pay.in/login" }
        });

        // Extract Cookies
        const cookies = loginRes.headers['set-cookie'];
        if(cookies) {
            session.defaults.headers.Cookie = cookies.join('; ');
        }

        // 3. Search for the Transaction ID
        const searchData = new URLSearchParams();
        searchData.append('action', 'load_transactions');
        searchData.append('page', '1');
        searchData.append('limit', '5');
        searchData.append('search', id); // Your TXN ID
        searchData.append('type', 'all');
        searchData.append('status', 'all');

        const txnRes = await session.post("https://ultra-pay.in/transactions", searchData, {
            headers: { "Referer": "https://ultra-pay.in/dashboard" }
        });

        const result = txnRes.data;

        if (result.success && result.transactions && result.transactions.length > 0) {
            // Find the exact match
            const exactTxn = result.transactions.find(t => (t.txnid === id || t.id === id) || t.title.includes(id));
            
            if(exactTxn) {
                return res.status(200).json({ success: true, transaction: exactTxn });
            } else {
                // If the array only has 1 item and search worked
                return res.status(200).json({ success: true, transaction: result.transactions[0] });
            }
        }

        return res.status(404).json({ success: false, error: "Transaction not found in database." });

    } catch (error) {
        console.error("API Error:", error.message);
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
}
