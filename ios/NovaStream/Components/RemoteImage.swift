import SwiftUI
import UIKit

/// Cache mémoire + disque des affiches et logos (équivalent de core/cache_manager.py).
final class ImageCache {
    static let shared = ImageCache()

    private let memory = NSCache<NSURL, UIImage>()
    private let session: URLSession

    private init() {
        memory.countLimit = 400
        let config = URLSessionConfiguration.default
        config.urlCache = URLCache(memoryCapacity: 32 * 1024 * 1024, diskCapacity: 300 * 1024 * 1024)
        config.requestCachePolicy = .returnCacheDataElseLoad
        config.timeoutIntervalForRequest = 20
        config.httpMaximumConnectionsPerHost = 8
        session = URLSession(configuration: config)
    }

    func cached(_ url: URL) -> UIImage? { memory.object(forKey: url as NSURL) }

    func image(for url: URL) async -> UIImage? {
        if let image = cached(url) { return image }
        guard let response = try? await session.data(from: url),
              let image = UIImage(data: response.0) else { return nil }
        // Réduit les grandes affiches pour économiser la mémoire, en gardant les proportions.
        let scale = min(1, 600 / max(image.size.width, image.size.height, 1))
        let target = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let prepared = await image.byPreparingThumbnail(ofSize: target) ?? image
        memory.setObject(prepared, forKey: url as NSURL)
        return prepared
    }
}

struct RemoteImage<Placeholder: View>: View {
    let url: URL?
    var contentMode: ContentMode = .fill
    @ViewBuilder var placeholder: () -> Placeholder

    @State private var image: UIImage?

    var body: some View {
        ZStack {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: contentMode)
                    .transition(.opacity)
            } else {
                placeholder()
            }
        }
        .task(id: url) {
            guard let url else { image = nil; return }
            if let cached = ImageCache.shared.cached(url) {
                image = cached
                return
            }
            let loaded = await ImageCache.shared.image(for: url)
            withAnimation(.easeOut(duration: 0.25)) { image = loaded }
        }
    }
}
