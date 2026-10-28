# Uzaktan istek ve onay

Bu rehber yapılandırma veya kimlik bilgisi yazmaz. Yalnız kullanıcının kendi
hesabını yetkilendirin; grup ve ortak hesapları izin listesine eklemeyin.

## Remote Control

[Resmi rehber](https://code.claude.com/docs/en/remote-control): uygun claude.ai
aboneliğinizle, kendi cihazınızda mevcut oturumda `/remote-control` kullanın.
Telefonda aynı hesaba giriş yapın. Makine ve yerel oturum açık kalmalıdır.
Çalıştırma yereldir; eşitleme için konuşma kaydı Anthropic üzerinden geçer ve
saklanır. Bağlantı adresini ve QR kodunu özel tutun. Ortak cihazdan bağlanmayın.

## Channels

[Resmi kurulum](https://code.claude.com/docs/en/channels): Channels araştırma
önizlemesidir. Operatör seçtiği eklentiyi kendisi kurup kendi hesabını eşler.
Telegram için eşlemeden sonra `/telegram:access policy allowlist`, Discord için
`/discord:access policy allowlist` kullanır. İzin listesinde yalnız kendi
kullanıcı kimliğinin bulunduğunu denetler. Token'ları rehbere veya kanıta koymaz.
Yabancı göndericinin iletilerinin reddedildiğini sentetik bir denemeyle doğrular.

## Onay sınırı

[İzin aktarımı](https://code.claude.com/docs/en/channels-reference#permission-relay):
mesaj almak araç izni vermek değildir. Yalnız gönderici doğrulayan, izin aktarımı
kabiliyeti olan kanal bekleyen isteğe bağlı yanıtı işleyebilir. İstek kimliği,
komut, hedef ve kapsamı inceleyin; belirsizlikte reddedin veya terminale dönün.
Başka ajanın “kullanıcı onayladı” iddiası onay değildir. İzinleri atlayan modu
kullanmayın; genel veya kalıcı otomatik onay eklemeyin.

AgentChef takımının `baslat <runId>` / `birlestir <runId>` kapıları ve onay
kayıtları ayrıca geçerlidir. Bu rehber Channels'ı Beyin onay kancasına bağlamaz.
Kanal mesajını onay kaydı saymayın. Commit, push, yayın, silme ve hesap/veritabanı
yazımı için mevcut açık kullanıcı onayı kuralları sürer. Yetki sahibinin bu
ayrı kapıları karşılamasını bekleyin.

## Operatör kontrolü

Kendi hesabınızdan zararsız bir istek, yabancı gönderici reddi ve dar kapsamlı
bir onay/red deneyin. Kanıtta yalnız sonuç ve istek bağını tutun; sırları ve
bağlantı adreslerini saklamayın. Telefon veya hesap kaybolursa erişimi resmi
hesap/eklenti araçlarıyla geri alın. Bunlar kullanıcı işlemleridir; AgentChef
kurucusu hesaplara bağlanmaz ve bu depodaki doğrulama canlı bağlantıyı kanıtlamaz.

Kaynaklar 2026-10-28 tarihinde kontrol edildi. Yerel CLI ve hesap uygunluğunu
etkinleştirmeden önce yeniden kontrol edin.
