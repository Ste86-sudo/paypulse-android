package com.paypulse.app

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.regex.Pattern

class NotificationService : NotificationListenerService() {

    private val TAG = "PayPulseNotification"

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        val packageName = sbn.packageName ?: ""
        val extras: Bundle = sbn.notification?.extras ?: Bundle.EMPTY
        val title = extras.getString("android.title") ?: ""
        val text = extras.getCharSequence("android.text")?.toString() ?: ""

        Log.d(TAG, "Notification received from app: $packageName")
        Log.d(TAG, "Title: $title | Text: $text")

        // 1. Filter notifications by financial app or SMS messengers
        val isFinancialApp = isFinancialApp(packageName, title, text)
        val isSms = isSmsApp(packageName)

        if (!isFinancialApp && !isSms) return

        // 2. Parse text content
        val parsedTx = parseNotificationText(text, packageName, title) ?: return

        Log.d(TAG, "Successfully parsed transaction! Amount: ${parsedTx.amount} | Merchant: ${parsedTx.merchant} | Bank: ${parsedTx.bank}")

        // 3. Deliver transaction to app
        deliverTransaction(parsedTx)
    }

    private fun isFinancialApp(packageName: String, title: String, text: String): Boolean {
        val p = packageName.toLowerCase(Locale.ROOT)
        return p.contains("paypal") ||
               p.contains("revolut") ||
               p.contains("intesasanpaolo") ||
               p.contains("unicredit") ||
               p.contains("postepay") ||
               p.contains("n26") ||
               p.contains("americanexpress") ||
               p.contains("h配套") || // common wrapper
               title.contains("PayPal", ignoreCase = true) ||
               text.contains("PayPal", ignoreCase = true)
    }

    private fun isSmsApp(packageName: String): Boolean {
        val p = packageName.toLowerCase(Locale.ROOT)
        return p.contains("messaging") || p.contains("mms") || p.contains("sms") || p.contains("telephony")
    }

    // Parsed transaction model
    data class ParsedTx(
        val amount: Double,
        val merchant: String,
        val bank: String,
        val type: String,
        val category: String,
        val date: String
    ) {
        fun toJSONString(): String {
            val json = JSONObject()
            json.put("id", "tx-native-" + System.currentTimeMillis())
            json.put("type", type)
            json.put("amount", amount)
            json.put("merchant", merchant)
            json.put("category", category)
            json.put("bank", bank)
            json.put("date", date)
            return json.toString()
        }
    }

    // RegEx NLP Parsing Engine (Kotlin Edition)
    private fun parseNotificationText(notificationText: String, packageName: String, title: String): ParsedTx? {
        val text = notificationText.trim()
        if (text.isEmpty()) return null

        var amount: Double? = null
        var merchant = "Esercente Sconosciuto"
        var type = "expense"
        var bank = "Carta / Banca"

        // A. Determine Bank source
        val lowerText = text.toLowerCase(Locale.ROOT)
        val lowerTitle = title.toLowerCase(Locale.ROOT)
        val lowerPackage = packageName.toLowerCase(Locale.ROOT)

        if (lowerPackage.contains("paypal") || lowerText.contains("paypal") || lowerTitle.contains("paypal")) {
            bank = "PayPal"
        } else if (lowerPackage.contains("intesa") || lowerText.contains("intesa sanpaolo") || lowerText.contains("operazione carta")) {
            bank = "Intesa SP"
        } else if (lowerPackage.contains("revolut") || lowerText.contains("revolut")) {
            bank = "Revolut"
        } else if (lowerPackage.contains("postepay") || lowerText.contains("postepay")) {
            bank = "PostePay"
        } else if (lowerPackage.contains("n26") || lowerText.contains("n26")) {
            bank = "N26"
        } else if (lowerPackage.contains("americanexpress") || lowerPackage.contains("amex") || lowerText.contains("amex") || lowerText.contains("american express")) {
            bank = "AMEX"
        }

        // B. Amount extraction
        val amountPatterns = listOf(
            Pattern.compile("(?:eur|€)\\s*([\\d.,]+)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("([\\d.,]+)\\s*(?:eur|€)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("addebito di\\s*([\\d.,]+)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("spesa di\\s*([\\d.,]+)", Pattern.CASE_INSENSITIVE)
        )

        for (pattern in amountPatterns) {
            val matcher = pattern.matcher(text)
            if (matcher.find()) {
                val rawVal = matcher.group(1) ?: continue
                try {
                    var cleanVal = rawVal
                    // Convert standard European notation (thousands dot, decimals comma) to dot decimals
                    if (cleanVal.contains(",") && cleanVal.contains(".")) {
                        cleanVal = cleanVal.replace(".", "").replace(",", ".")
                    } else if (cleanVal.contains(",")) {
                        cleanVal = cleanVal.replace(",", ".")
                    }
                    val parsed = cleanVal.toDoubleOrNull()
                    if (parsed != null) {
                        amount = parsed
                        break
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing numeric amount from match: $rawVal", e)
                }
            }
        }

        if (amount == null) return null // Must have an amount to represent a transaction!

        // C. Check transaction type (Income vs Expense)
        if (lowerText.contains("ricevuto") || lowerText.contains("accredito") || lowerText.contains("accreditati") ||
            lowerText.contains("stipendio") || lowerText.contains("bonifico a tuo favore")) {
            type = "income"
        }

        // D. Merchant name extraction
        val merchantPatterns = listOf(
            Pattern.compile("presso\\s+([^,.\\d\\n]+)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("a\\s+favore\\s+di\\s+([^,.\\d\\n]+)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("inviato\\s+(?:a|per)\\s+([^,.\\d\\n]+?)(?:\\s+con|\\.|\\b)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("da\\s+([^,.\\d\\n]+)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("effettuata\\s+da\\s+([^,.\\d\\n]+)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("a\\s+([^,.\\d\\n]+)", Pattern.CASE_INSENSITIVE)
        )

        for (pattern in merchantPatterns) {
            val matcher = pattern.matcher(text)
            if (matcher.find()) {
                var candidate = matcher.group(1)?.trim() ?: continue
                
                // Clean up articles and connector suffixes
                candidate = candidate.replace("^(?i)(un|una|il|lo|la|i|gli|le|a|da|su|con|per|in|con successo)\\s+".toRegex(), "")
                candidate = candidate.replace("(?i)\\s+(effettuato|effettuata|carta|terminante|con successo|con|del|al).*$".toRegex(), "")
                
                if (candidate.length > 2 && candidate.length < 40) {
                    merchant = candidate
                    break
                }
            }
        }

        // E. Automatic categorization based on merchant
        var category = "Altro"
        val mLower = merchant.toLowerCase(Locale.ROOT)

        if (type == "income") {
            category = "Stipendio"
        } else {
            if (mLower.contains("netflix") || mLower.contains("spotify") || mLower.contains("disney") ||
                mLower.contains("prime") || mLower.contains("steam") || mLower.contains("playstation") || mLower.contains("cinema")) {
                category = "Intrattenimento"
            } else if (mLower.contains("esselunga") || mLower.contains("coop") || mLower.contains("conad") ||
                mLower.contains("carrefour") || mLower.contains("lidl") || mLower.contains("supermercato") || mLower.contains("despar")) {
                category = "Spesa"
            } else if (mLower.contains("uber") || mLower.contains("eni") || mLower.contains("q8") ||
                mLower.contains("treno") || mLower.contains("trenitalia") || mLower.contains("taxi") || mLower.contains("benzina")) {
                category = "Trasporti"
            } else if (mLower.contains("zara") || mLower.contains("h&m") || mLower.contains("amazon") ||
                mLower.contains("asos") || mLower.contains("nike") || mLower.contains("zalando") || mLower.contains("decathlon")) {
                category = "Shopping"
            } else if (mLower.contains("deliveroo") || mLower.contains("just eat") || mLower.contains("glovo") ||
                mLower.contains("ristorante") || mLower.contains("pizzeria") || mLower.contains("mcdonald") || mLower.contains("bar")) {
                category = "Ristorazione"
            } else if (mLower.contains("enel") || mLower.contains("gas") || mLower.contains("luce") ||
                mLower.contains("servizio elettrico") || mLower.contains("affitto") || mLower.contains("bolletta")) {
                category = "Utenze"
            }
        }

        val todayDate = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(Date())

        return ParsedTx(amount, merchant, bank, type, category, todayDate)
    }

    private fun deliverTransaction(tx: ParsedTx) {
        val jsonStr = tx.toJSONString()

        // 1. If MainActivity is alive and running, we can deliver it in real time via broadcast!
        if (MainActivity.isAppActive) {
            Log.d(TAG, "App is active! Sending real-time broadcast...")
            val intent = Intent("com.paypulse.app.NEW_TRANSACTION")
            intent.putExtra("transaction_json", jsonStr)
            sendBroadcast(intent)
        } else {
            // 2. If app is closed, cache it in SharedPreferences to import it at subsequent boot
            Log.d(TAG, "App is closed. Caching in SharedPreferences queue.")
            val prefs = getSharedPreferences("paypulse_native_prefs", Context.MODE_PRIVATE)
            val currentQueue = prefs.getStringSet("pending_notifications", HashSet<String>()) ?: HashSet()
            
            // SharedPrefs stringsets are read-only references, we must create a copy to mutate!
            val newQueue = HashSet(currentQueue)
            newQueue.add(jsonStr)
            
            prefs.edit().putStringSet("pending_notifications", newQueue).apply()
            Log.d(TAG, "Cache size now: ${newQueue.size}")
        }
    }
}
