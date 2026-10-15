import 'dart:collection';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

// The web app (index.html, css/, js/, icons/) is copied into assets/www by tool/sync_web.ps1 and
// bundled inside the APK/IPA, so it runs offline from the first launch. The app's logic is unchanged;
// this file only hosts it in a WebView.

const _brand = Color(0xFF6D3FF0);
const _background = Color(0xFFF6F4FF);

// Android: WebViewAssetLoader serves the bundled files from a fixed https origin. ES modules
// (index.html loads js/app.js as a module) do not load from file:// URLs.
const _androidHost = 'appassets.androidplatform.net';
final _androidUrl = WebUri('https://$_androidHost/assets/flutter_assets/assets/www/index.html');

// iOS: a loopback HTTP server serves the bundled files. The port is fixed because localStorage,
// where the app keeps all its data, is tied to the origin.
const _iosPort = 52173;
final _iosServer = InAppLocalhostServer(documentRoot: 'assets/www', port: _iosPort);
final _iosUrl = WebUri('http://localhost:$_iosPort/index.html');

// Settings > Export data creates a blob URL and clicks an <a download>. WebViews do not save blob
// downloads, so hand the file to Flutter, which opens the share sheet (save to Files/Drive, email...).
const _exportBridge = r'''
(() => {
  const blobs = new Map();
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  const click = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = (obj) => {
    const url = create(obj);
    if (obj instanceof Blob) blobs.set(url, obj);
    return url;
  };
  URL.revokeObjectURL = (url) => {
    blobs.delete(url);
    revoke(url);
  };
  HTMLAnchorElement.prototype.click = function () {
    const blob = this.download && blobs.get(this.href);
    if (!blob) return click.call(this);
    const name = this.download;
    blob.text().then((text) => window.flutter_inappwebview.callHandler("saveFile", name, blob.type, text));
  };
})();
''';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: _background,
    statusBarIconBrightness: Brightness.dark,
    statusBarBrightness: Brightness.light,
    systemNavigationBarColor: Colors.white,
    systemNavigationBarIconBrightness: Brightness.dark,
  ));
  if (Platform.isIOS) await _iosServer.start();
  runApp(const AisoryApp());
}

class AisoryApp extends StatelessWidget {
  const AisoryApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AI-SORY TALK',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorSchemeSeed: _brand, scaffoldBackgroundColor: _background),
      home: const WebShell(),
    );
  }
}

class WebShell extends StatefulWidget {
  const WebShell({super.key});

  @override
  State<WebShell> createState() => _WebShellState();
}

class _WebShellState extends State<WebShell> {
  InAppWebViewController? _controller;

  bool _isAppUrl(WebUri? url) {
    if (url == null) return false;
    if (Platform.isAndroid) return url.scheme == 'https' && url.host == _androidHost;
    return url.host == 'localhost' && url.port == _iosPort;
  }

  Future<void> _saveFile(List<dynamic> args) async {
    final name = (args[0] as String).replaceAll(RegExp(r'[\\/:*?"<>|]'), '_');
    final mime = args[1] as String;
    final file = File('${(await getTemporaryDirectory()).path}/$name');
    await file.writeAsString(args[2] as String);
    if (!mounted) return;
    final box = context.findRenderObject() as RenderBox?;
    await SharePlus.instance.share(ShareParams(
      files: [XFile(file.path, mimeType: mime.isEmpty ? null : mime)],
      subject: name,
      sharePositionOrigin: box == null ? null : box.localToGlobal(Offset.zero) & box.size,
    ));
  }

  // Android back button: go back through the app's screens (hash routes), then leave the app.
  Future<void> _onBack() async {
    final controller = _controller;
    if (controller != null && await controller.canGoBack()) {
      await controller.goBack();
    } else {
      await SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _onBack();
      },
      child: Scaffold(
        body: SafeArea(
          child: InAppWebView(
            initialUrlRequest: URLRequest(url: Platform.isAndroid ? _androidUrl : _iosUrl),
            initialSettings: InAppWebViewSettings(
              isInspectable: kDebugMode,
              supportZoom: false,
              transparentBackground: true,
              useShouldOverrideUrlLoading: true,
              allowFileAccess: false,
              allowContentAccess: false,
              allowFileAccessFromFileURLs: false,
              allowUniversalAccessFromFileURLs: false,
              webViewAssetLoader: WebViewAssetLoader(
                domain: _androidHost,
                pathHandlers: [AssetsPathHandler(path: '/assets/')],
              ),
            ),
            initialUserScripts: UnmodifiableListView([
              UserScript(source: _exportBridge, injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START),
            ]),
            onWebViewCreated: (controller) {
              _controller = controller;
              controller.addJavaScriptHandler(handlerName: 'saveFile', callback: _saveFile);
            },
            // The app is self-contained: stay on its own pages and ignore navigation anywhere else.
            shouldOverrideUrlLoading: (controller, action) async {
              if (!action.isForMainFrame || _isAppUrl(action.request.url)) {
                return NavigationActionPolicy.ALLOW;
              }
              return NavigationActionPolicy.CANCEL;
            },
          ),
        ),
      ),
    );
  }
}
