import SwiftUI
import WebKit

// MARK: - View Model

class WebViewModel: ObservableObject {
    @Published var isLoading = true
    @Published var showError = false
    @Published var errorMessage = ""

    let url = URL(string: "https://poker-simulator-gamma.vercel.app")!

    weak var webView: WKWebView?

    func retry() {
        showError = false
        isLoading = true
        webView?.load(URLRequest(url: url))
    }
}

// MARK: - WKWebView Representable

struct WebView: UIViewRepresentable {
    @ObservedObject var viewModel: WebViewModel

    func makeCoordinator() -> Coordinator {
        Coordinator(viewModel: viewModel)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()

        // Enable JavaScript
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true
        configuration.defaultWebpagePreferences = preferences

        // Enable DOM storage (localStorage, sessionStorage)
        configuration.websiteDataStore = .default()

        // Allow inline media playback
        configuration.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: configuration)

        // Custom user agent
        webView.evaluateJavaScript("navigator.userAgent") { result, _ in
            if let userAgent = result as? String {
                webView.customUserAgent = "\(userAgent) PokerAnalyzer-iOS"
            }
        }

        // Dark background to prevent white flash
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.1, green: 0.1, blue: 0.1, alpha: 1.0)
        webView.scrollView.backgroundColor = UIColor(red: 0.1, green: 0.1, blue: 0.1, alpha: 1.0)

        // Enable swipe back/forward navigation
        webView.allowsBackForwardNavigationGestures = true

        // Pull-to-refresh
        let refreshControl = UIRefreshControl()
        refreshControl.tintColor = .white
        refreshControl.addTarget(
            context.coordinator,
            action: #selector(Coordinator.handleRefresh(_:)),
            for: .valueChanged
        )
        webView.scrollView.refreshControl = refreshControl

        // Set delegates
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator

        // Store reference for retry
        viewModel.webView = webView

        // Load the URL
        webView.load(URLRequest(url: viewModel.url))

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        // No dynamic updates needed
    }

    // MARK: - Coordinator

    class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let viewModel: WebViewModel

        init(viewModel: WebViewModel) {
            self.viewModel = viewModel
        }

        @objc func handleRefresh(_ refreshControl: UIRefreshControl) {
            viewModel.webView?.reload()
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                refreshControl.endRefreshing()
            }
        }

        // MARK: - WKNavigationDelegate

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.viewModel.isLoading = true
                self.viewModel.showError = false
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            DispatchQueue.main.async {
                self.viewModel.isLoading = false
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            handleError(error)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            handleError(error)
        }

        private func handleError(_ error: Error) {
            let nsError = error as NSError
            // Ignore cancelled navigations (e.g., user tapped a link before page loaded)
            if nsError.code == NSURLErrorCancelled { return }

            DispatchQueue.main.async {
                self.viewModel.isLoading = false
                self.viewModel.showError = true
                self.viewModel.errorMessage = error.localizedDescription
            }
        }

        // MARK: - External link handling

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }

            let appHost = "poker-simulator-gamma.vercel.app"

            // Allow navigation within the app's domain and initial load
            if url.host == appHost || url.scheme == "about" || url.scheme == "blob" {
                decisionHandler(.allow)
                return
            }

            // Open external links in Safari
            if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }

            // Allow other requests (API calls, etc.)
            decisionHandler(.allow)
        }

        // MARK: - WKUIDelegate (handle target="_blank" links)

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            // Open target="_blank" links in the same webview or Safari
            if let url = navigationAction.request.url {
                let appHost = "poker-simulator-gamma.vercel.app"
                if url.host == appHost {
                    webView.load(navigationAction.request)
                } else {
                    UIApplication.shared.open(url)
                }
            }
            return nil
        }
    }
}
