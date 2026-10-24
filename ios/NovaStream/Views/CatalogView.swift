import SwiftUI

/// Grille des films ou des séries, filtrable par catégorie et par recherche.
struct CatalogView: View {
    let section: CatalogSection

    @EnvironmentObject private var model: AppModel
    @State private var category = "all"
    @State private var query = ""

    private var title: String { section == .movies ? "Films" : "Séries" }
    private var items: [MediaItem] { section == .movies ? model.movies : model.series }
    private var categories: [MediaCategory] { section == .movies ? model.movieCategories : model.seriesCategories }

    private var filtered: [MediaItem] {
        items.filter { item in
            (category == "all" || item.categoryId == category)
                && (query.isEmpty || item.name.localizedCaseInsensitiveContains(query))
        }
    }

    private var chipOptions: [ChipOption<String>] {
        [ChipOption(id: "all", label: "Tout")] + categories.map { ChipOption(id: $0.id, label: $0.name) }
    }

    var body: some View {
        NavigationStack {
            LoadStateContainer(state: model.state(of: section), retry: { await model.load(section) }) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if categories.count > 0 {
                            ChipRow(options: chipOptions, selection: $category)
                        }
                        let results = filtered
                        Text("\(results.count) titre\(results.count > 1 ? "s" : "")")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Theme.muted)
                            .padding(.horizontal, 16)
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104, maximum: 180), spacing: 12, alignment: .top)],
                                  spacing: 18) {
                            ForEach(results) { item in
                                NavigationLink(value: item) { PosterCard(item: item) }
                                    .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    .padding(.vertical, 12)
                }
                .refreshable { await model.load(section) }
            }
            .screenBackground()
            .navigationTitle(title)
            .searchable(text: $query, prompt: section == .movies ? "Rechercher un film" : "Rechercher une série")
            .task { await model.loadIfNeeded(section) }
            .mediaDestinations()
        }
    }
}
