// Curated reference outline; no exam questions or licensed answer keys.
export interface StudyTemplateSubject {key:string;title:string;topics:{key:string;title:string}[]}
const subject=(key:string,title:string,titles:string):StudyTemplateSubject=>({key,title,topics:titles.split('|').map((title,i)=>({key:`${key}-${i+1}`,title}))})
export const tytTemplate={key:'tyt-core',revision:'2026-10',checkedAt:'2026-10-23',source:'https://ogmmateryal.eba.gov.tr/mebi-konu-ozetleri',subjects:[
 subject('turkish','Türkçe','Sözcükte anlam|Cümlede anlam|Paragraf ve anlatım|Sözcük türleri|Sözcükte yapı|Fiiller ve fiilimsiler|Cümlenin ögeleri|Cümle türleri|Ses bilgisi|Yazım kuralları|Noktalama|Anlatım bozuklukları'),
 subject('math','Matematik','Temel kavramlar|Sayı basamakları|Bölme ve bölünebilme|EBOB ve EKOK|Rasyonel sayılar|Eşitsizlikler|Mutlak değer|Üslü ifadeler|Köklü ifadeler|Çarpanlara ayırma|Oran ve orantı|Denklemler|Sayı ve kesir problemleri|Yaş problemleri|Yüzde, kâr ve zarar|Hareket problemleri|İş ve havuz problemleri|Karışım problemleri|Kümeler|Mantık|Fonksiyonlar|Sayma ve olasılık|Veri ve istatistik'),
 subject('geometry','Geometri','Doğruda ve açıda ilişkiler|Üçgenler|Üçgende benzerlik|Üçgende alan ve uzunluk|Çokgenler|Dörtgenler|Çember ve daire|Analitik geometri|Katı cisimler'),
 subject('physics','Fizik','Fizik bilimine giriş|Madde ve özellikleri|Hareket ve kuvvet|İş, enerji ve güç|Isı ve sıcaklık|Basınç ve kaldırma kuvveti|Elektrik ve manyetizma|Dalgalar|Optik'),
 subject('chemistry','Kimya','Kimya bilimi|Atom ve periyodik sistem|Kimyasal türler arası etkileşimler|Maddenin hâlleri|Doğa ve kimya|Kimyasal hesaplamalar|Karışımlar|Asit, baz ve tuz|Kimya günlük yaşamda'),
 subject('biology','Biyoloji','Canlıların ortak özellikleri|Canlıların temel bileşenleri|Hücre ve organeller|Hücre zarından madde geçişleri|Canlıların sınıflandırılması|Hücre bölünmeleri|Kalıtım|Ekosistem ve çevre'),
 subject('history','Tarih','Tarih ve zaman|İlk uygarlıklar|İlk Türk devletleri|İslam tarihi|Türk İslam devletleri|Osmanlı kuruluş ve yükseliş|Osmanlı değişim ve yenileşme|Millî Mücadele|Atatürk ilke ve inkılapları'),
 subject('geography','Coğrafya','Doğa ve insan|Dünya ve hareketleri|Harita bilgisi|İklim bilgisi|Yer şekilleri|Su, toprak ve bitki örtüsü|Nüfus ve yerleşme|Bölgeler ve ekonomik faaliyetler|Doğal afetler'),
 subject('philosophy','Felsefe','Felsefenin konusu|Bilgi felsefesi|Varlık felsefesi|Ahlak felsefesi|Sanat felsefesi|Din felsefesi|Siyaset felsefesi|Bilim felsefesi'),
 subject('religion','Din Kültürü','Bilgi ve inanç|Din ve İslam|İbadet ve ahlak|Hz. Muhammed ve örnekliği|Vahiy ve akıl|İslam düşüncesi|Din, kültür ve medeniyet'),
]}
export function selectedTemplate(keys:Set<string>){return {...tytTemplate,subjects:tytTemplate.subjects.map(s=>({...s,topics:s.topics.filter(topic=>keys.has(topic.key))})).filter(s=>s.topics.length)}}
