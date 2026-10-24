import SwiftUI

/// Affiche 2:3 avec badge de note, comme les cartes de la version Windows.
struct PosterCard: View {
    let item: MediaItem
    var width: CGFloat? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Color.clear
                .aspectRatio(2 / 3, contentMode: .fit)
                .overlay {
                    RemoteImage(url: item.imageURL) { PosterPlaceholder(title: item.name) }
                }
                .overlay(alignment: .topLeading) {
                    if let rating = item.ratingText {
                        RatingBadge(text: rating).padding(6)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border, lineWidth: 1))
                .shadow(color: .black.opacity(0.5), radius: 8, y: 4)
            Text(item.name)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.textSecondary)
                .lineLimit(1)
        }
        .frame(width: width)
        .contentShape(Rectangle())
    }
}

struct PosterPlaceholder: View {
    let title: String

    var body: some View {
        ZStack(alignment: .bottom) {
            Theme.gradient(for: title)
            Circle()
                .fill(Color.white.opacity(0.18))
                .frame(width: 70, height: 70)
                .frame(maxHeight: .infinity, alignment: .center)
                .offset(y: -20)
            Text(title.uppercased())
                .font(Theme.display(15))
                .foregroundStyle(.white.opacity(0.92))
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.6)
                .padding(10)
        }
    }
}

struct RatingBadge: View {
    let text: String

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "star.fill").foregroundStyle(Theme.gold)
            Text(text).foregroundStyle(.white)
        }
        .font(.system(size: 10, weight: .bold))
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(.black.opacity(0.65), in: Capsule())
    }
}

struct QualityBadge: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(Theme.textSecondary)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(Theme.active, in: RoundedRectangle(cornerRadius: 5))
    }
}

struct LiveBadge: View {
    var body: some View {
        Text("DIRECT")
            .font(.system(size: 10, weight: .heavy))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Theme.live, in: RoundedRectangle(cornerRadius: 6))
    }
}

/// Logo de chaîne carré, avec initiales si le serveur n'en fournit pas.
struct ChannelLogo: View {
    let item: MediaItem
    var size: CGFloat = 44

    var body: some View {
        RemoteImage(url: item.imageURL, contentMode: .fit) {
            ZStack {
                Theme.gradient(for: item.name)
                Text(item.initials)
                    .font(.system(size: size * 0.3, weight: .heavy))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

struct ChipOption<ID: Hashable>: Identifiable {
    let id: ID
    let label: String
}

/// Rangée de filtres en pastilles (catégories, saisons).
struct ChipRow<ID: Hashable>: View {
    let options: [ChipOption<ID>]
    @Binding var selection: ID

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(options) { option in
                    let selected = option.id == selection
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) { selection = option.id }
                    } label: {
                        Text(option.label)
                            .font(.subheadline.weight(selected ? .semibold : .regular))
                            .foregroundStyle(selected ? Color.black : Theme.textSecondary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(selected ? Color.white : Theme.card, in: Capsule())
                            .overlay(Capsule().stroke(selected ? .clear : Theme.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
        }
    }
}

struct SectionHeader: View {
    let title: String
    var action: (() -> Void)? = nil

    var body: some View {
        HStack {
            Text(title)
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
            Spacer()
            if let action {
                Button(action: action) {
                    HStack(spacing: 4) {
                        Text("Tout voir")
                        Image(systemName: "chevron.right")
                    }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Theme.textSecondary)
                }
            }
        }
        .padding(.horizontal, 16)
    }
}

/// Bouton principal blanc et bouton secondaire translucide, comme sur les fiches de bureau.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.bold))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundStyle(.black)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(.white, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .opacity(configuration.isPressed ? 0.8 : 1)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.bold))
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(.white.opacity(0.25), lineWidth: 1))
            .opacity(configuration.isPressed ? 0.8 : 1)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}

/// Affiche chargement, erreur avec « Réessayer », ou le contenu.
struct LoadStateContainer<Content: View>: View {
    let state: LoadState
    let retry: () async -> Void
    @ViewBuilder var content: () -> Content

    var body: some View {
        switch state {
        case .idle, .loading:
            ProgressView()
                .tint(.white)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .failed(let message):
            VStack(spacing: 14) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.largeTitle)
                    .foregroundStyle(Theme.muted)
                Text(message)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Theme.textSecondary)
                Button("Réessayer") { Task { await retry() } }
                    .buttonStyle(PrimaryButtonStyle())
            }
            .padding(32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .loaded:
            content()
        }
    }
}

/// Logo NovaStream : icône + nom, dessiné en vectoriel pour rester net sur tous les écrans.
struct NovaLogo: View {
    var height: CGFloat = 32

    var body: some View {
        HStack(spacing: height * 0.3) {
            Image("Mark")
                .resizable()
                .scaledToFit()
                .frame(width: height, height: height)
            Text("NovaStream")
                .font(Theme.display(height * 0.68))
                .foregroundStyle(.white)
        }
    }
}
