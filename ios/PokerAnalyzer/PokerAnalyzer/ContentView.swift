import SwiftUI

struct ContentView: View {
    @StateObject private var webViewModel = WebViewModel()

    var body: some View {
        ZStack {
            Color(red: 0.1, green: 0.1, blue: 0.1)
                .ignoresSafeArea()

            WebView(viewModel: webViewModel)
                .ignoresSafeArea(edges: .bottom)

            if webViewModel.isLoading {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    .scaleEffect(1.2)
            }

            if webViewModel.showError {
                errorOverlay
            }
        }
        .statusBarHidden(false)
    }

    private var errorOverlay: some View {
        VStack(spacing: 20) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 48))
                .foregroundColor(.gray)

            Text("Unable to Connect")
                .font(.title2)
                .fontWeight(.semibold)
                .foregroundColor(.white)

            Text(webViewModel.errorMessage)
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button(action: {
                webViewModel.retry()
            }) {
                Text("Retry")
                    .fontWeight(.medium)
                    .foregroundColor(.white)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 12)
                    .background(Color.blue)
                    .cornerRadius(10)
            }
            .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 0.1, green: 0.1, blue: 0.1))
    }
}
