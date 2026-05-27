package com.paypulse.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val TAG = "PayPulseMainActivity"
    
    // Receiver for real-time notification intercepts while app is in foreground
    private val transactionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val jsonStr = intent?.getStringExtra("transaction_json") ?: return
            Log.d(TAG, "Real-time transaction broadcast received in Activity: $jsonStr")
            
            // Deliver in real time into webapp context
            runOnUiThread {
                webView.evaluateJavascript("javascript:if(window.handleNativeNotification) { window.handleNativeNotification('$jsonStr'); }", null)
            }
        }
    }

    companion object {
        var isAppActive = false
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Dynamic WebView setup inside AppCompat
        webView = WebView(this)
        setContentView(webView)

        configureWebViewSettings()

        // Bind secure JavascriptInterface bridge named 'AndroidBridge'
        webView.addJavascriptInterface(AndroidWebAppInterface(this), "AndroidBridge")

        // Load the offline webapp index file placed under assets/www/
        webView.loadUrl("file:///android_asset/www/index.html")

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "PayPulse WebView fully loaded!")
            }
        }
    }

    private fun configureWebViewSettings() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        
        // Full viewport layout support
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        
        // Cache management
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        
        // Access permissions for local resources
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        
        // Disable scrollbar overlays for cleaner fullscreen feel
        webView.isHorizontalScrollBarEnabled = false
        webView.isVerticalScrollBarEnabled = false
    }

    override fun onStart() {
        super.onStart()
        isAppActive = true
        // Register foreground real-time transaction listener
        val filter = IntentFilter("com.paypulse.app.NEW_TRANSACTION")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(transactionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(transactionReceiver, filter)
        }
    }

    override fun onStop() {
        super.onStop()
        isAppActive = false
        unregisterReceiver(transactionReceiver)
    }

    // JS Bridge class accessible via window.AndroidBridge in frontend JavaScript
    inner class AndroidWebAppInterface(private val context: Context) {

        private val PREFS_NAME = "paypulse_native_prefs"

        @JavascriptInterface
        fun isNotificationServiceEnabled(): Boolean {
            val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
            if (!TextUtils.isEmpty(flat)) {
                val names = flat.split(":")
                for (name in names) {
                    if (name.contains(context.packageName)) {
                        return true
                    }
                }
            }
            return false
        }

        @JavascriptInterface
        fun openNotificationAccessSettings() {
            Log.d(TAG, "Opening Notification Access settings pane...")
            val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }

        @JavascriptInterface
        fun getPendingTransactions(): String {
            val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val queue = prefs.getStringSet("pending_notifications", null) ?: return "[]"
            
            val jsonArray = JSONArray()
            queue.forEach {
                jsonArray.put(JSONObject(it))
            }
            Log.d(TAG, "Fetching pending offline queue. Size: ${jsonArray.length()}")
            return jsonArray.toString()
        }

        @JavascriptInterface
        fun clearPendingTransactions() {
            Log.d(TAG, "Clearing pending offline transactions queue.")
            val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().remove("pending_notifications").apply()
        }
    }
}
