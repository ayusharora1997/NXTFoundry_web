// Country calling codes for the contact form's phone picker: [ISO 3166-1 alpha-2, name, dial code].
// Dial codes for North American Numbering Plan territories include their area code ("1 876" = Jamaica);
// the US, Canada, Puerto Rico and the Dominican Republic use plain "1".
export type Country = { iso: string; name: string; dial: string };

const DATA = `af|Afghanistan|93;ax|Åland Islands|358;al|Albania|355;dz|Algeria|213;as|American Samoa|1 684;ad|Andorra|376;ao|Angola|244;
ai|Anguilla|1 264;aq|Antarctica|672;ag|Antigua and Barbuda|1 268;ar|Argentina|54;am|Armenia|374;aw|Aruba|297;au|Australia|61;
at|Austria|43;az|Azerbaijan|994;bs|Bahamas|1 242;bh|Bahrain|973;bd|Bangladesh|880;bb|Barbados|1 246;by|Belarus|375;be|Belgium|32;
bz|Belize|501;bj|Benin|229;bm|Bermuda|1 441;bt|Bhutan|975;bo|Bolivia|591;bq|Caribbean Netherlands|599;ba|Bosnia and Herzegovina|387;
bw|Botswana|267;br|Brazil|55;io|British Indian Ocean Territory|246;vg|British Virgin Islands|1 284;bn|Brunei|673;bg|Bulgaria|359;
bf|Burkina Faso|226;bi|Burundi|257;kh|Cambodia|855;cm|Cameroon|237;ca|Canada|1;cv|Cape Verde|238;ky|Cayman Islands|1 345;
cf|Central African Republic|236;td|Chad|235;cl|Chile|56;cn|China|86;cx|Christmas Island|61;cc|Cocos (Keeling) Islands|61;
co|Colombia|57;km|Comoros|269;cg|Congo|242;cd|Congo (DRC)|243;ck|Cook Islands|682;cr|Costa Rica|506;ci|Côte d’Ivoire|225;
hr|Croatia|385;cu|Cuba|53;cw|Curaçao|599;cy|Cyprus|357;cz|Czechia|420;dk|Denmark|45;dj|Djibouti|253;dm|Dominica|1 767;
do|Dominican Republic|1;ec|Ecuador|593;eg|Egypt|20;sv|El Salvador|503;gq|Equatorial Guinea|240;er|Eritrea|291;ee|Estonia|372;
sz|Eswatini|268;et|Ethiopia|251;fk|Falkland Islands|500;fo|Faroe Islands|298;fj|Fiji|679;fi|Finland|358;fr|France|33;
gf|French Guiana|594;pf|French Polynesia|689;ga|Gabon|241;gm|Gambia|220;ge|Georgia|995;de|Germany|49;gh|Ghana|233;gi|Gibraltar|350;
gr|Greece|30;gl|Greenland|299;gd|Grenada|1 473;gp|Guadeloupe|590;gu|Guam|1 671;gt|Guatemala|502;gg|Guernsey|44;gn|Guinea|224;
gw|Guinea-Bissau|245;gy|Guyana|592;ht|Haiti|509;hn|Honduras|504;hk|Hong Kong|852;hu|Hungary|36;is|Iceland|354;in|India|91;
id|Indonesia|62;ir|Iran|98;iq|Iraq|964;ie|Ireland|353;im|Isle of Man|44;il|Israel|972;it|Italy|39;jm|Jamaica|1 876;jp|Japan|81;
je|Jersey|44;jo|Jordan|962;kz|Kazakhstan|7;ke|Kenya|254;ki|Kiribati|686;xk|Kosovo|383;kw|Kuwait|965;kg|Kyrgyzstan|996;la|Laos|856;
lv|Latvia|371;lb|Lebanon|961;ls|Lesotho|266;lr|Liberia|231;ly|Libya|218;li|Liechtenstein|423;lt|Lithuania|370;lu|Luxembourg|352;
mo|Macao|853;mg|Madagascar|261;mw|Malawi|265;my|Malaysia|60;mv|Maldives|960;ml|Mali|223;mt|Malta|356;mh|Marshall Islands|692;
mq|Martinique|596;mr|Mauritania|222;mu|Mauritius|230;yt|Mayotte|262;mx|Mexico|52;fm|Micronesia|691;md|Moldova|373;mc|Monaco|377;
mn|Mongolia|976;me|Montenegro|382;ms|Montserrat|1 664;ma|Morocco|212;mz|Mozambique|258;mm|Myanmar|95;na|Namibia|264;nr|Nauru|674;
np|Nepal|977;nl|Netherlands|31;nc|New Caledonia|687;nz|New Zealand|64;ni|Nicaragua|505;ne|Niger|227;ng|Nigeria|234;nu|Niue|683;
nf|Norfolk Island|672;kp|North Korea|850;mk|North Macedonia|389;mp|Northern Mariana Islands|1 670;no|Norway|47;om|Oman|968;
pk|Pakistan|92;pw|Palau|680;ps|Palestine|970;pa|Panama|507;pg|Papua New Guinea|675;py|Paraguay|595;pe|Peru|51;ph|Philippines|63;
pl|Poland|48;pt|Portugal|351;pr|Puerto Rico|1;qa|Qatar|974;re|Réunion|262;ro|Romania|40;ru|Russia|7;rw|Rwanda|250;
bl|Saint Barthélemy|590;sh|Saint Helena|290;kn|Saint Kitts and Nevis|1 869;lc|Saint Lucia|1 758;mf|Saint Martin|590;
pm|Saint Pierre and Miquelon|508;vc|Saint Vincent and the Grenadines|1 784;ws|Samoa|685;sm|San Marino|378;st|São Tomé and Príncipe|239;
sa|Saudi Arabia|966;sn|Senegal|221;rs|Serbia|381;sc|Seychelles|248;sl|Sierra Leone|232;sg|Singapore|65;sx|Sint Maarten|1 721;
sk|Slovakia|421;si|Slovenia|386;sb|Solomon Islands|677;so|Somalia|252;za|South Africa|27;kr|South Korea|82;ss|South Sudan|211;
es|Spain|34;lk|Sri Lanka|94;sd|Sudan|249;sr|Suriname|597;sj|Svalbard and Jan Mayen|47;se|Sweden|46;ch|Switzerland|41;sy|Syria|963;
tw|Taiwan|886;tj|Tajikistan|992;tz|Tanzania|255;th|Thailand|66;tl|Timor-Leste|670;tg|Togo|228;tk|Tokelau|690;to|Tonga|676;
tt|Trinidad and Tobago|1 868;tn|Tunisia|216;tr|Türkiye|90;tm|Turkmenistan|993;tc|Turks and Caicos Islands|1 649;tv|Tuvalu|688;
vi|U.S. Virgin Islands|1 340;ug|Uganda|256;ua|Ukraine|380;ae|United Arab Emirates|971;gb|United Kingdom|44;us|United States|1;
uy|Uruguay|598;uz|Uzbekistan|998;vu|Vanuatu|678;va|Vatican City|39;ve|Venezuela|58;vn|Vietnam|84;wf|Wallis and Futuna|681;
eh|Western Sahara|212;ye|Yemen|967;zm|Zambia|260;zw|Zimbabwe|263`;

export const COUNTRIES: Country[] = DATA.split(';').map(s => {
  const [iso, name, dial] = s.trim().split('|');
  return { iso, name, dial };
});

export const DEFAULT_COUNTRY = 'in';

/** Countries whose leading 0 is part of the number internationally (so it is not dropped as a trunk prefix). */
const KEEP_LEADING_ZERO = new Set(['it', 'sm', 'va']);

/**
 * "+91 98765 43210" from country + what the visitor typed. A number typed with its own "+" is used as typed.
 * One leading trunk "0" is dropped (080 4000 1234 in India -> +91 80 4000 1234), except where it is kept.
 */
export function composePhone(iso: string, national: string): string {
  const typed = national.trim().replace(/\s+/g, ' ');
  if (!typed) return '';
  if (typed.startsWith('+')) return typed;
  const c = COUNTRIES.find(x => x.iso === iso);
  if (!c) return typed;
  const local = KEEP_LEADING_ZERO.has(c.iso) ? typed : typed.replace(/^0(?=\d)/, '');
  return `+${c.dial} ${local}`;
}
