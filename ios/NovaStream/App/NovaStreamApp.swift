import AVFoundation
import SwiftUI

@main
struct NovaStreamApp: App {
    @StateObject private var model = AppModel()

    init() {
        // Son actif même avec le bouton silencieux, lecture en arrière-plan et Picture in Picture.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)

        let tabBar = UITabBarAppearance()
        tabBar.configureWithOpaqueBackground()
        tabBar.backgroundColor = UIColor(Theme.panel)
        UITabBar.appearance().standardAppearance = tabBar
        UITabBar.appearance().scrollEdgeAppearance = tabBar

        let navBar = UINavigationBarAppearance()
        navBar.configureWithOpaqueBackground()
        navBar.backgroundColor = UIColor(Theme.background)
        navBar.shadowColor = .clear
        navBar.titleTextAttributes = [.foregroundColor: UIColor.white]
        navBar.largeTitleTextAttributes = [
            .foregroundColor: UIColor.white,
            .font: UIFont.systemFont(ofSize: 32, weight: .black).rounded,
        ]
        UINavigationBar.appearance().standardAppearance = navBar
        UINavigationBar.appearance().scrollEdgeAppearance = navBar
        UINavigationBar.appearance().compactAppearance = navBar
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .preferredColorScheme(.dark)
                .tint(Theme.accent)
        }
    }
}

private extension UIFont {
    var rounded: UIFont {
        guard let descriptor = fontDescriptor.withDesign(.rounded) else { return self }
        return UIFont(descriptor: descriptor, size: pointSize)
    }
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        ZStack {
            Theme.background.ignoresSafeArea()
            switch model.phase {
            case .launching:
                VStack(spacing: 20) {
                    NovaLogo(height: 44)
                    ProgressView().tint(.white)
                }
            case .loggedOut:
                LoginView()
                    .transition(.opacity)
            case .ready:
                MainTabView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: model.phase)
        .task { await model.restoreSession() }
        .fullScreenCover(item: $model.playback) { playback in
            PlayerScreen(playback: playback)
                .environmentObject(model)
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        TabView(selection: $model.selectedTab) {
            HomeView()
                .tabItem { Label("Accueil", systemImage: "house") }
                .tag(AppTab.home)
            LiveView()
                .tabItem { Label("En direct", systemImage: "dot.radiowaves.left.and.right") }
                .tag(AppTab.live)
            CatalogView(section: .movies)
                .tabItem { Label("Films", systemImage: "film") }
                .tag(AppTab.movies)
            CatalogView(section: .series)
                .tabItem { Label("Séries", systemImage: "play.rectangle.on.rectangle") }
                .tag(AppTab.series)
            FavoritesView()
                .tabItem { Label("Ma liste", systemImage: "heart") }
                .tag(AppTab.myList)
        }
    }
}

extension View {
    /// Ouvre la fiche d'un film ou d'une série depuis n'importe quel onglet.
    func mediaDestinations() -> some View {
        navigationDestination(for: MediaItem.self) { item in
            switch item.kind {
            case .series: SeriesDetailView(item: item)
            case .movie, .live: MovieDetailView(item: item)
            }
        }
    }

    func screenBackground() -> some View {
        background(Theme.background.ignoresSafeArea())
            .toolbarBackground(Theme.background, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
    }
}
