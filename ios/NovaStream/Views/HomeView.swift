import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 30) {
                    hero

                    if !model.favorites.isEmpty {
                        rail("Ma liste", items: model.favorites) { model.selectedTab = .myList }
                    }

                    if !model.channels.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            SectionHeader(title: "En direct") { model.selectedTab = .live }
                            ScrollView(.horizontal, showsIndicators: false) {
                                LazyHStack(spacing: 12) {
                                    ForEach(model.channels.prefix(20)) { channel in
                                        Button { model.play(channel) } label: { ChannelTile(item: channel) }
                                            .buttonStyle(.plain)
                                    }
                                }
                                .padding(.horizontal, 16)
                            }
                        }
                    }

                    rail("Nouveaux films", items: model.recentMovies) { model.selectedTab = .movies }
                    rail("Séries à découvrir", items: model.recentSeries) { model.selectedTab = .series }

                    if case .failed(let message) = model.state(of: .movies) {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(Theme.muted)
                            .padding(.horizontal, 16)
                    }
                }
                .padding(.bottom, 30)
            }
            .screenBackground()
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    NovaLogo(height: 26)
                }
                ToolbarItemGroup(placement: .navigationBarTrailing) {
                    NavigationLink { SearchView() } label: { Image(systemName: "magnifyingglass") }
                    Button { showSettings = true } label: { Image(systemName: "person.crop.circle") }
                }
            }
            .tint(.white)
            .refreshable { await model.reload() }
            .task {
                async let live: Void = model.loadIfNeeded(.live)
                async let movies: Void = model.loadIfNeeded(.movies)
                async let series: Void = model.loadIfNeeded(.series)
                _ = await (live, movies, series)
            }
            .sheet(isPresented: $showSettings) { SettingsView() }
            .mediaDestinations()
        }
    }

    private var hero: some View {
        ZStack(alignment: .bottomLeading) {
            Image("Hero")
                .resizable()
                .scaledToFill()
                .frame(height: 440)
                .frame(maxWidth: .infinity)
                .clipped()
            LinearGradient(
                stops: [
                    .init(color: .clear, location: 0.2),
                    .init(color: Theme.background.opacity(0.75), location: 0.65),
                    .init(color: Theme.background, location: 1),
                ],
                startPoint: .top, endPoint: .bottom
            )
            VStack(alignment: .leading, spacing: 12) {
                Text("NOVASTREAM")
                    .font(.caption.weight(.bold))
                    .tracking(2)
                    .foregroundStyle(Theme.eyebrow)
                Text("Votre prochaine histoire commence ici.")
                    .font(Theme.display(32))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Le direct, les films et les séries de votre abonnement, réunis dans une seule expérience.")
                    .font(.subheadline)
                    .foregroundStyle(Theme.textSecondary)
                HStack(spacing: 10) {
                    Button { model.selectedTab = .movies } label: {
                        Label("Explorer les films", systemImage: "play.fill")
                    }
                    .buttonStyle(PrimaryButtonStyle())
                    Button { model.selectedTab = .live } label: {
                        Label("Voir le direct", systemImage: "dot.radiowaves.left.and.right")
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
                .padding(.top, 4)
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 8)
        }
    }

    @ViewBuilder
    private func rail(_ title: String, items: [MediaItem], seeAll: @escaping () -> Void) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(title: title, action: seeAll)
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: 12) {
                        ForEach(items) { item in
                            if item.kind == .live {
                                Button { model.play(item) } label: { PosterCard(item: item, width: 124) }
                                    .buttonStyle(.plain)
                            } else {
                                NavigationLink(value: item) { PosterCard(item: item, width: 124) }
                                    .buttonStyle(.plain)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
        }
    }
}

/// Vignette de chaîne pour l'accueil.
struct ChannelTile: View {
    let item: MediaItem

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ChannelLogo(item: item, size: 56)
            Text(item.name)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
        }
        .padding(12)
        .frame(width: 130, height: 130, alignment: .topLeading)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.border, lineWidth: 1))
    }
}
