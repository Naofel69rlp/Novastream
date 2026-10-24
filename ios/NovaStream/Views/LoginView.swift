import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var model: AppModel

    @State private var server = ""
    @State private var username = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var error: String?
    @FocusState private var focus: Field?

    private enum Field { case server, username, password }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                NovaLogo(height: 44)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 48)

                VStack(alignment: .leading, spacing: 6) {
                    Text("NOVASTREAM")
                        .font(.caption.weight(.bold))
                        .tracking(2)
                        .foregroundStyle(Theme.eyebrow)
                    Text("Connexion à votre abonnement")
                        .font(Theme.display(28))
                        .foregroundStyle(.white)
                    Text("Entrez les identifiants Xtream Codes fournis par votre fournisseur IPTV.")
                        .font(.subheadline)
                        .foregroundStyle(Theme.muted)
                }

                VStack(spacing: 12) {
                    field("URL du serveur", systemImage: "server.rack") {
                        TextField("", text: $server, prompt: prompt("http://exemple.com:8080"))
                            .keyboardType(.URL)
                            .textContentType(.URL)
                            .focused($focus, equals: .server)
                            .submitLabel(.next)
                            .onSubmit { focus = .username }
                    }
                    field("Utilisateur", systemImage: "person") {
                        TextField("", text: $username, prompt: prompt("Nom d'utilisateur"))
                            .textContentType(.username)
                            .focused($focus, equals: .username)
                            .submitLabel(.next)
                            .onSubmit { focus = .password }
                    }
                    field("Mot de passe", systemImage: "lock") {
                        SecureField("", text: $password, prompt: prompt("Mot de passe"))
                            .textContentType(.password)
                            .focused($focus, equals: .password)
                            .submitLabel(.go)
                            .onSubmit(submit)
                    }
                }
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

                if let error {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(Color(hex: 0xFCA5A5))
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(hex: 0xEF4444, opacity: 0.12), in: RoundedRectangle(cornerRadius: 10))
                }

                Button(action: submit) {
                    HStack {
                        if isLoading { ProgressView().tint(.black) }
                        Text(isLoading ? "Connexion…" : "Se connecter")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isLoading)

                Button {
                    model.startDemo()
                } label: {
                    Text("Essayer le mode démo").frame(maxWidth: .infinity)
                }
                .buttonStyle(SecondaryButtonStyle())

                Label("Vos identifiants restent sur cet iPhone, dans le trousseau iOS.", systemImage: "lock.shield")
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 40)
            .frame(maxWidth: 520)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(
            ZStack {
                Theme.background
                Image("Hero")
                    .resizable()
                    .scaledToFill()
                    .opacity(0.25)
                    .blur(radius: 18)
                LinearGradient(colors: [.clear, Theme.background], startPoint: .top, endPoint: .center)
            }
            .ignoresSafeArea()
        )
    }

    private func prompt(_ text: String) -> Text {
        Text(text).foregroundColor(Theme.muted.opacity(0.7))
    }

    private func field<Content: View>(_ title: String, systemImage: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.muted)
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .foregroundStyle(Theme.muted)
                    .frame(width: 20)
                content()
                    .foregroundStyle(.white)
            }
            .padding(14)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.border, lineWidth: 1))
        }
    }

    @MainActor
    private func submit() {
        guard !isLoading else { return }
        focus = nil
        error = nil
        isLoading = true
        Task {
            defer { isLoading = false }
            do {
                try await model.login(Credentials(server: server, username: username, password: password))
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
