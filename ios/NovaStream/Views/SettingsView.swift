import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @AppStorage(LiveFormat.storageKey) private var liveFormat = LiveFormat.hls.rawValue

    var body: some View {
        NavigationStack {
            Form {
                Section("Compte") {
                    if let user = model.user {
                        row("Utilisateur", user.username)
                        HStack {
                            Text("Statut")
                            Spacer()
                            Circle().fill(user.status.lowercased() == "active" ? Theme.success : Theme.gold)
                                .frame(width: 8, height: 8)
                            Text(user.status.lowercased() == "active" ? "Abonnement actif" : user.status)
                                .foregroundStyle(Theme.muted)
                        }
                        row("Expire le", user.expirationText)
                        row("Connexions", "\(user.activeConnections) / \(user.maxConnections)")
                    }
                    row("Serveur", model.server)
                }
                .listRowBackground(Theme.card)

                Section {
                    Picker("Format du direct", selection: $liveFormat) {
                        ForEach(LiveFormat.allCases) { format in
                            Text(format.label).tag(format.rawValue)
                        }
                    }
                } header: {
                    Text("Lecture")
                } footer: {
                    Text("iOS lit le HLS (.m3u8) nativement. Si une chaîne ne démarre pas, essayez l'autre format ou ouvrez-la dans VLC depuis le lecteur.")
                }
                .listRowBackground(Theme.card)

                Section {
                    Button("Recharger le catalogue") {
                        Task { await model.reload() }
                        dismiss()
                    }
                    Button("Se déconnecter", role: .destructive) {
                        dismiss()
                        model.logout()
                    }
                }
                .listRowBackground(Theme.card)

                Section {
                    row("Version", Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0")
                }
                .listRowBackground(Theme.card)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.background.ignoresSafeArea())
            .navigationTitle("Paramètres")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }
                }
            }
        }
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(value)
                .foregroundStyle(Theme.muted)
                .lineLimit(1)
                .truncationMode(.middle)
        }
    }
}
