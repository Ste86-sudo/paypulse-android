# Add project specific Proguard rules here.
# By default, the flags in this file are appended to flags specified
# in C:\Users\stefano.farise\AppData\Local\Android\Sdk/tools/proguard/proguard-android.txt
# You can edit the include path and specify your own rules

-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
