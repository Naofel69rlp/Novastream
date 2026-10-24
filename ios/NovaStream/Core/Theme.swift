import SwiftUI

/// Palette « cinéma sombre » reprise de core/config.py de l'appli Windows.
enum Theme {
    static let background = Color(hex: 0x09090B)
    static let panel = Color(hex: 0x111116)
    static let card = Color(hex: 0x16161F)
    static let hover = Color(hex: 0x20202E)
    static let active = Color(hex: 0x262638)
    static let border = Color(hex: 0x222230)
    static let accent = Color(hex: 0x3B82F6)
    static let accentLight = Color(hex: 0x60A5FA)
    static let cinema = Color(hex: 0xE50914)
    static let live = Color(hex: 0xF43F5E)
    static let gold = Color(hex: 0xF59E0B)
    static let eyebrow = Color(hex: 0x2DD4BF)
    static let success = Color(hex: 0x10B981)
    static let textPrimary = Color.white
    static let textSecondary = Color(hex: 0xE4E4E7)
    static let muted = Color(hex: 0xA1A1AA)

    static func display(_ size: CGFloat) -> Font {
        .system(size: size, weight: .black, design: .rounded)
    }

    /// Dégradés des affiches de remplacement, choisis à partir du nom.
    static let placeholderGradients: [[Color]] = [
        [Color(hex: 0x7F1D1D), Color(hex: 0x3B0A0A)],
        [Color(hex: 0x15803D), Color(hex: 0x134E4A)],
        [Color(hex: 0x4D7C0F), Color(hex: 0x14532D)],
        [Color(hex: 0x3B0764), Color(hex: 0x1E1B4B)],
        [Color(hex: 0x9A3412), Color(hex: 0x451A03)],
        [Color(hex: 0x9F1239), Color(hex: 0x4C0519)],
        [Color(hex: 0x155E75), Color(hex: 0x1E1B4B)],
    ]

    static func gradient(for seed: String) -> LinearGradient {
        let hash = seed.unicodeScalars.reduce(UInt(5381)) { ($0 &* 33) &+ UInt($1.value) }
        let index = Int(hash % UInt(placeholderGradients.count))
        return LinearGradient(colors: placeholderGradients[index], startPoint: .top, endPoint: .bottom)
    }
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}
