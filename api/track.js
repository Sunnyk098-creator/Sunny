const axios = require('axios');

// 👇 1. YAHAN APNI ASLI DETAILS BHAREIN 👇
const ADMIN_PHONE = "3693693693"; 
const ADMIN_PASS = "2824519534@Ab";

// XOR Encryption (Ultra Pay Login Bypass)
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
    if (!id) return res.status(400).json({ success: false, error: "Missing Transaction ID" });

    try {
        const session = axios.create({
            headers: {
                "User-Agent": "Mozilla/5.0",
                "X-Requested-With": "XMLHttpRequest"
            }
        });

        // 2. Direct Background Login 
        const rawPayload = JSON.stringify({
            action: "login_verify",
            timestamp: Date.now(),
            data: { walletNumber: ADMIN_PHONE, password: ADMIN_PASS, remember: "yes" }
        });
        
        const loginPayload = { payload: encryptPayload(rawPayload) };
        
        const loginRes = await session.post("https://ultra-pay.in/loghandler.php", loginPayload, {
            headers: { "Content-Type": "application/json", "Referer": "https://ultra-pay.in/login" }
        });

        // Extract Cookies
        const cookies = loginRes.headers['set-cookie'];
        if(cookies) {
            session.defaults.headers.Cookie = cookies.join('; ');
        } else {
            return res.status(500).json({ success: false, error: "Ultra Pay Login Failed. Details check karein." });
        }

        // 3. Search for the Transaction ID
        const searchData = new URLSearchParams();
        searchData.append('action', 'load_transactions');
        searchData.append('page', '1');
        searchData.append('limit', '5'); // 5 ki jagah 10 bhi kar sakte hain agar purani txn hai
        searchData.append('search', id); 
        searchData.append('type', 'all');
        searchData.append('status', 'all');

        const txnRes = await session.post("https://ultra-pay.in/transactions", searchData, {
            headers: { "Referer": "https://ultra-pay.in/dashboard" }
        });

        const result = txnRes.data;

        if (result.success && result.transactions && result.transactions.length > 0) {
            // Find Exact Match
            const exactTxn = result.transactions.find(t => (t.txnid === id || t.id === id) || t.title.includes(id));
            
            if(exactTxn) {
                return res.status(200).json({ success: true, transaction: exactTxn });
            } else {
                return res.status(200).json({ success: true, transaction: result.transactions[0] });
            }
        }

        return res.status(404).json({ success: false, error: "Transaction Database me nahi mili." });

    } catch (error) {
        console.error("API Error:", error.message);
        return res.status(500).json({ success: false, error: "Internal Server Error" });
    }
}
