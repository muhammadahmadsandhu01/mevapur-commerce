/**
 * @file countryRegistry.js
 * @description Versioned ISO 3166-1 Country Metadata Registry and Address Policy Baseline.
 *
 * PROVENANCE METADATA BY FIELD FAMILY:
 * - Country Identity (Alpha-2, Alpha-3, 3-character Numeric): ISO 3166-1:2020 (ISO 3166 Maintenance Agency)
 * - Country Calling Codes: ITU-T E.164 (International Telecommunication Union)
 * - Address & Postal Requirement Policies: Universal Postal Union (UPU) / MevaPur Address Baseline Policy v1.0
 * - Snapshot Date: 2026-09-11
 */

const CommerceError = require('../core/CommerceError');

const REGISTRY_PROVENANCE = Object.freeze({
  identityStandard: 'ISO 3166-1',
  identitySource: 'ISO 3166 Maintenance Agency (ISO 3166/MA)',
  identityPublication: 'ISO 3166-1:2020 (Officially Assigned Country Codes)',
  telecomStandard: 'ITU-T E.164',
  telecomSource: 'International Telecommunication Union (ITU-T E.164 National Numbering Plans)',
  addressPolicyStandard: 'UPU / MevaPur Commerce Address Baseline',
  addressPolicySnapshot: 'MevaPur Address Baseline Policy v1.0',
  snapshotDate: '2026-09-11'
});

/**
 * Complete Official ISO 3166-1 Country Dataset (249 officially assigned codes).
 * Format: [alpha2, alpha3, numeric3, name, defaultCurrency, defaultLocale, callingCode, postalPolicy, adminPolicy, adminType]
 * numeric3: 3-character string preserving leading zeros (e.g. '004', '008', '036', '040', '048')
 * postalPolicy: 'required' | 'optional' | 'not_used' | 'unknown'
 * adminPolicy: 'required' | 'optional' | 'unknown'
 * adminType: 'province' | 'state' | 'emirate' | 'prefecture' | 'county' | 'region' | 'department' | 'governorate' | 'district' | 'none' | 'unknown'
 */
const RAW_COUNTRIES = [
  ['AD', 'AND', '020', 'Andorra', 'EUR', 'ca-AD', '+376', 'unknown', 'unknown', 'unknown'],
  ['AE', 'ARE', '784', 'United Arab Emirates', 'AED', 'ar-AE', '+971', 'not_used', 'required', 'emirate'],
  ['AF', 'AFG', '004', 'Afghanistan', 'AFN', 'fa-AF', '+93', 'unknown', 'unknown', 'unknown'],
  ['AG', 'ATG', '028', 'Antigua and Barbuda', 'XCD', 'en-AG', '+1268', 'unknown', 'unknown', 'unknown'],
  ['AI', 'AIA', '660', 'Anguilla', 'XCD', 'en-AI', '+1264', 'unknown', 'unknown', 'unknown'],
  ['AL', 'ALB', '008', 'Albania', 'ALL', 'sq-AL', '+355', 'unknown', 'unknown', 'unknown'],
  ['AM', 'ARM', '051', 'Armenia', 'AMD', 'hy-AM', '+374', 'unknown', 'unknown', 'unknown'],
  ['AO', 'AGO', '024', 'Angola', 'AOA', 'pt-AO', '+244', 'unknown', 'unknown', 'unknown'],
  ['AQ', 'ATA', '010', 'Antarctica', 'USD', 'en-AQ', '+672', 'unknown', 'unknown', 'unknown'],
  ['AR', 'ARG', '032', 'Argentina', 'ARS', 'es-AR', '+54', 'required', 'required', 'province'],
  ['AS', 'ASM', '016', 'American Samoa', 'USD', 'en-AS', '+1684', 'unknown', 'unknown', 'unknown'],
  ['AT', 'AUT', '040', 'Austria', 'EUR', 'de-AT', '+43', 'required', 'required', 'state'],
  ['AU', 'AUS', '036', 'Australia', 'AUD', 'en-AU', '+61', 'required', 'required', 'state'],
  ['AW', 'ABW', '533', 'Aruba', 'AWG', 'nl-AW', '+297', 'unknown', 'unknown', 'unknown'],
  ['AX', 'ALA', '248', 'Åland Islands', 'EUR', 'sv-AX', '+358', 'unknown', 'unknown', 'unknown'],
  ['AZ', 'AZE', '031', 'Azerbaijan', 'AZN', 'az-AZ', '+994', 'unknown', 'unknown', 'unknown'],
  ['BA', 'BIH', '070', 'Bosnia and Herzegovina', 'BAM', 'bs-BA', '+387', 'unknown', 'unknown', 'unknown'],
  ['BB', 'BRB', '052', 'Barbados', 'BBD', 'en-BB', '+1246', 'unknown', 'unknown', 'unknown'],
  ['BD', 'BGD', '050', 'Bangladesh', 'BDT', 'bn-BD', '+880', 'required', 'required', 'district'],
  ['BE', 'BEL', '056', 'Belgium', 'EUR', 'nl-BE', '+32', 'required', 'optional', 'province'],
  ['BF', 'BFA', '854', 'Burkina Faso', 'XOF', 'fr-BF', '+226', 'unknown', 'unknown', 'unknown'],
  ['BG', 'BGR', '100', 'Bulgaria', 'EUR', 'bg-BG', '+359', 'unknown', 'unknown', 'unknown'],
  ['BH', 'BHR', '048', 'Bahrain', 'BHD', 'ar-BH', '+973', 'required', 'optional', 'region'],
  ['BI', 'BDI', '108', 'Burundi', 'BIF', 'fr-BI', '+257', 'unknown', 'unknown', 'unknown'],
  ['BJ', 'BEN', '204', 'Benin', 'XOF', 'fr-BJ', '+229', 'unknown', 'unknown', 'unknown'],
  ['BL', 'BLM', '652', 'Saint Barthélemy', 'EUR', 'fr-BL', '+590', 'unknown', 'unknown', 'unknown'],
  ['BM', 'BMU', '060', 'Bermuda', 'BMD', 'en-BM', '+1441', 'unknown', 'unknown', 'unknown'],
  ['BN', 'BRN', '096', 'Brunei Darussalam', 'BND', 'ms-BN', '+673', 'unknown', 'unknown', 'unknown'],
  ['BO', 'BOL', '068', 'Bolivia', 'BOB', 'es-BO', '+591', 'unknown', 'unknown', 'unknown'],
  ['BQ', 'BES', '535', 'Bonaire, Sint Eustatius and Saba', 'USD', 'nl-BQ', '+599', 'unknown', 'unknown', 'unknown'],
  ['BR', 'BRA', '076', 'Brazil', 'BRL', 'pt-BR', '+55', 'required', 'required', 'state'],
  ['BS', 'BHS', '044', 'Bahamas', 'BSD', 'en-BS', '+1242', 'unknown', 'unknown', 'unknown'],
  ['BT', 'BTN', '064', 'Bhutan', 'BTN', 'dz-BT', '+975', 'unknown', 'unknown', 'unknown'],
  ['BV', 'BVT', '074', 'Bouvet Island', 'NOK', 'no-BV', '+47', 'unknown', 'unknown', 'unknown'],
  ['BW', 'BWA', '072', 'Botswana', 'BWP', 'en-BW', '+267', 'unknown', 'unknown', 'unknown'],
  ['BY', 'BLR', '112', 'Belarus', 'BYN', 'be-BY', '+375', 'unknown', 'unknown', 'unknown'],
  ['BZ', 'BLZ', '084', 'Belize', 'BZD', 'en-BZ', '+501', 'unknown', 'unknown', 'unknown'],
  ['CA', 'CAN', '124', 'Canada', 'CAD', 'en-CA', '+1', 'required', 'required', 'province'],
  ['CC', 'CCK', '166', 'Cocos (Keeling) Islands', 'AUD', 'en-CC', '+61', 'unknown', 'unknown', 'unknown'],
  ['CD', 'COD', '180', 'Congo (Democratic Republic of the)', 'CDF', 'fr-CD', '+243', 'unknown', 'unknown', 'unknown'],
  ['CF', 'CAF', '140', 'Central African Republic', 'XAF', 'fr-CF', '+236', 'unknown', 'unknown', 'unknown'],
  ['CG', 'COG', '178', 'Congo', 'XAF', 'fr-CG', '+242', 'unknown', 'unknown', 'unknown'],
  ['CH', 'CHE', '756', 'Switzerland', 'CHF', 'de-CH', '+41', 'required', 'required', 'state'],
  ['CI', 'CIV', '384', "Côte d'Ivoire", 'XOF', 'fr-CI', '+225', 'unknown', 'unknown', 'unknown'],
  ['CK', 'COK', '184', 'Cook Islands', 'NZD', 'en-CK', '+682', 'unknown', 'unknown', 'unknown'],
  ['CL', 'CHL', '152', 'Chile', 'CLP', 'es-CL', '+56', 'required', 'required', 'region'],
  ['CM', 'CMR', '120', 'Cameroon', 'XAF', 'fr-CM', '+237', 'unknown', 'unknown', 'unknown'],
  ['CN', 'CHN', '156', 'China', 'CNY', 'zh-CN', '+86', 'required', 'required', 'province'],
  ['CO', 'COL', '170', 'Colombia', 'COP', 'es-CO', '+57', 'required', 'required', 'department'],
  ['CR', 'CRI', '188', 'Costa Rica', 'CRC', 'es-CR', '+506', 'unknown', 'unknown', 'unknown'],
  ['CU', 'CUB', '192', 'Cuba', 'CUP', 'es-CU', '+53', 'unknown', 'unknown', 'unknown'],
  ['CV', 'CPV', '132', 'Cabo Verde', 'CVE', 'pt-CV', '+238', 'unknown', 'unknown', 'unknown'],
  ['CW', 'CUW', '531', 'Curaçao', 'ANG', 'nl-CW', '+599', 'unknown', 'unknown', 'unknown'],
  ['CX', 'CXR', '162', 'Christmas Island', 'AUD', 'en-CX', '+61', 'unknown', 'unknown', 'unknown'],
  ['CY', 'CYP', '196', 'Cyprus', 'EUR', 'el-CY', '+357', 'unknown', 'unknown', 'unknown'],
  ['CZ', 'CZE', '203', 'Czech Republic', 'CZK', 'cs-CZ', '+420', 'required', 'optional', 'region'],
  ['DE', 'DEU', '276', 'Germany', 'EUR', 'de-DE', '+49', 'required', 'optional', 'state'],
  ['DJ', 'DJI', '262', 'Djibouti', 'DJF', 'fr-DJ', '+253', 'unknown', 'unknown', 'unknown'],
  ['DK', 'DNK', '208', 'Denmark', 'DKK', 'da-DK', '+45', 'required', 'optional', 'region'],
  ['DM', 'DMA', '212', 'Dominica', 'XCD', 'en-DM', '+1767', 'unknown', 'unknown', 'unknown'],
  ['DO', 'DOM', '214', 'Dominican Republic', 'DOP', 'es-DO', '+1809', 'unknown', 'unknown', 'unknown'],
  ['DZ', 'DZA', '012', 'Algeria', 'DZD', 'ar-DZ', '+213', 'unknown', 'unknown', 'unknown'],
  ['EC', 'ECU', '218', 'Ecuador', 'USD', 'es-EC', '+593', 'unknown', 'unknown', 'unknown'],
  ['EE', 'EST', '233', 'Estonia', 'EUR', 'et-EE', '+372', 'unknown', 'unknown', 'unknown'],
  ['EG', 'EGY', '818', 'Egypt', 'EGP', 'ar-EG', '+20', 'required', 'required', 'governorate'],
  ['EH', 'ESH', '732', 'Western Sahara', 'MAD', 'ar-EH', '+212', 'unknown', 'unknown', 'unknown'],
  ['ER', 'ERI', '232', 'Eritrea', 'ERN', 'ti-ER', '+291', 'unknown', 'unknown', 'unknown'],
  ['ES', 'ESP', '724', 'Spain', 'EUR', 'es-ES', '+34', 'required', 'required', 'province'],
  ['ET', 'ETH', '231', 'Ethiopia', 'ETB', 'am-ET', '+251', 'unknown', 'unknown', 'unknown'],
  ['FI', 'FIN', '246', 'Finland', 'EUR', 'fi-FI', '+358', 'required', 'optional', 'region'],
  ['FJ', 'FJI', '242', 'Fiji', 'FJD', 'en-FJ', '+679', 'unknown', 'unknown', 'unknown'],
  ['FK', 'FLK', '238', 'Falkland Islands (Malvinas)', 'FKP', 'en-FK', '+500', 'unknown', 'unknown', 'unknown'],
  ['FM', 'FSM', '583', 'Micronesia (Federated States of)', 'USD', 'en-FM', '+691', 'unknown', 'unknown', 'unknown'],
  ['FO', 'FRO', '234', 'Faroe Islands', 'DKK', 'fo-FO', '+298', 'unknown', 'unknown', 'unknown'],
  ['FR', 'FRA', '250', 'France', 'EUR', 'fr-FR', '+33', 'required', 'optional', 'region'],
  ['GA', 'GAB', '266', 'Gabon', 'XAF', 'fr-GA', '+241', 'unknown', 'unknown', 'unknown'],
  ['GB', 'GBR', '826', 'United Kingdom', 'GBP', 'en-GB', '+44', 'required', 'optional', 'county'],
  ['GD', 'GRD', '308', 'Grenada', 'XCD', 'en-GD', '+1473', 'unknown', 'unknown', 'unknown'],
  ['GE', 'GEO', '268', 'Georgia', 'GEL', 'ka-GE', '+995', 'unknown', 'unknown', 'unknown'],
  ['GF', 'GUF', '254', 'French Guiana', 'EUR', 'fr-GF', '+594', 'unknown', 'unknown', 'unknown'],
  ['GG', 'GGY', '831', 'Guernsey', 'GBP', 'en-GG', '+44', 'unknown', 'unknown', 'unknown'],
  ['GH', 'GHA', '288', 'Ghana', 'GHS', 'en-GH', '+233', 'unknown', 'unknown', 'unknown'],
  ['GI', 'GIB', '292', 'Gibraltar', 'GIP', 'en-GI', '+350', 'unknown', 'unknown', 'unknown'],
  ['GL', 'GRL', '304', 'Greenland', 'DKK', 'kl-GL', '+299', 'unknown', 'unknown', 'unknown'],
  ['GM', 'GMB', '270', 'Gambia', 'GMD', 'en-GM', '+220', 'unknown', 'unknown', 'unknown'],
  ['GN', 'GIN', '324', 'Guinea', 'GNF', 'fr-GN', '+224', 'unknown', 'unknown', 'unknown'],
  ['GP', 'GLP', '312', 'Guadeloupe', 'EUR', 'fr-GP', '+590', 'unknown', 'unknown', 'unknown'],
  ['GQ', 'GNQ', '226', 'Equatorial Guinea', 'XAF', 'es-GQ', '+240', 'unknown', 'unknown', 'unknown'],
  ['GR', 'GRC', '300', 'Greece', 'EUR', 'el-GR', '+30', 'required', 'optional', 'region'],
  ['GS', 'SGS', '239', 'South Georgia and the South Sandwich Islands', 'GBP', 'en-GS', '+500', 'unknown', 'unknown', 'unknown'],
  ['GT', 'GTM', '320', 'Guatemala', 'GTQ', 'es-GT', '+502', 'unknown', 'unknown', 'unknown'],
  ['GU', 'GUM', '316', 'Guam', 'USD', 'en-GU', '+1671', 'unknown', 'unknown', 'unknown'],
  ['GW', 'GNB', '624', 'Guinea-Bissau', 'XOF', 'pt-GW', '+245', 'unknown', 'unknown', 'unknown'],
  ['GY', 'GUY', '328', 'Guyana', 'GYD', 'en-GY', '+592', 'unknown', 'unknown', 'unknown'],
  ['HK', 'HKG', '344', 'Hong Kong', 'HKD', 'zh-HK', '+852', 'not_used', 'optional', 'region'],
  ['HM', 'HMD', '334', 'Heard Island and McDonald Islands', 'AUD', 'en-HM', '+672', 'unknown', 'unknown', 'unknown'],
  ['HN', 'HND', '340', 'Honduras', 'HNL', 'es-HN', '+504', 'unknown', 'unknown', 'unknown'],
  ['HR', 'HRV', '191', 'Croatia', 'EUR', 'hr-HR', '+385', 'unknown', 'unknown', 'unknown'],
  ['HT', 'HTI', '332', 'Haiti', 'HTG', 'fr-HT', '+509', 'unknown', 'unknown', 'unknown'],
  ['HU', 'HUN', '348', 'Hungary', 'HUF', 'hu-HU', '+36', 'required', 'required', 'county'],
  ['ID', 'IDN', '360', 'Indonesia', 'IDR', 'id-ID', '+62', 'required', 'required', 'province'],
  ['IE', 'IRL', '372', 'Ireland', 'EUR', 'en-IE', '+353', 'required', 'required', 'county'],
  ['IL', 'ISR', '376', 'Israel', 'ILS', 'he-IL', '+972', 'required', 'optional', 'district'],
  ['IM', 'IMN', '833', 'Isle of Man', 'GBP', 'en-IM', '+44', 'unknown', 'unknown', 'unknown'],
  ['IN', 'IND', '356', 'India', 'INR', 'en-IN', '+91', 'required', 'required', 'state'],
  ['IO', 'IOT', '086', 'British Indian Ocean Territory', 'USD', 'en-IO', '+246', 'unknown', 'unknown', 'unknown'],
  ['IQ', 'IRQ', '368', 'Iraq', 'IQD', 'ar-IQ', '+964', 'unknown', 'unknown', 'unknown'],
  ['IR', 'IRN', '364', 'Iran', 'IRR', 'fa-IR', '+98', 'unknown', 'unknown', 'unknown'],
  ['IS', 'ISL', '352', 'Iceland', 'ISK', 'is-IS', '+354', 'unknown', 'unknown', 'unknown'],
  ['IT', 'ITA', '380', 'Italy', 'EUR', 'it-IT', '+39', 'required', 'required', 'province'],
  ['JE', 'JEY', '832', 'Jersey', 'GBP', 'en-JE', '+44', 'unknown', 'unknown', 'unknown'],
  ['JM', 'JAM', '388', 'Jamaica', 'JMD', 'en-JM', '+1876', 'unknown', 'unknown', 'unknown'],
  ['JO', 'JOR', '400', 'Jordan', 'JOD', 'ar-JO', '+962', 'required', 'required', 'governorate'],
  ['JP', 'JPN', '392', 'Japan', 'JPY', 'ja-JP', '+81', 'required', 'required', 'prefecture'],
  ['KE', 'KEN', '404', 'Kenya', 'KES', 'en-KE', '+254', 'optional', 'required', 'county'],
  ['KG', 'KGZ', '417', 'Kyrgyzstan', 'KGS', 'ky-KG', '+996', 'unknown', 'unknown', 'unknown'],
  ['KH', 'KHM', '116', 'Cambodia', 'KHR', 'km-KH', '+855', 'unknown', 'unknown', 'unknown'],
  ['KI', 'KIR', '296', 'Kiribati', 'AUD', 'en-KI', '+686', 'unknown', 'unknown', 'unknown'],
  ['KM', 'COM', '174', 'Comoros', 'KMF', 'ar-KM', '+269', 'unknown', 'unknown', 'unknown'],
  ['KN', 'KNA', '659', 'Saint Kitts and Nevis', 'XCD', 'en-KN', '+1869', 'unknown', 'unknown', 'unknown'],
  ['KP', 'PRK', '408', "Korea (Democratic People's Republic of)", 'KPW', 'ko-KP', '+850', 'unknown', 'unknown', 'unknown'],
  ['KR', 'KOR', '410', 'South Korea', 'KRW', 'ko-KR', '+82', 'required', 'required', 'province'],
  ['KW', 'KWT', '414', 'Kuwait', 'KWD', 'ar-KW', '+965', 'optional', 'required', 'region'],
  ['KY', 'CYM', '136', 'Cayman Islands', 'KYD', 'en-KY', '+1345', 'unknown', 'unknown', 'unknown'],
  ['KZ', 'KAZ', '398', 'Kazakhstan', 'KZT', 'kk-KZ', '+7', 'unknown', 'unknown', 'unknown'],
  ['LA', 'LAO', '418', "Lao People's Democratic Republic", 'LAK', 'lo-LA', '+856', 'unknown', 'unknown', 'unknown'],
  ['LB', 'LBN', '422', 'Lebanon', 'LBP', 'ar-LB', '+961', 'unknown', 'unknown', 'unknown'],
  ['LC', 'LCA', '662', 'Saint Lucia', 'XCD', 'en-LC', '+1758', 'unknown', 'unknown', 'unknown'],
  ['LI', 'LIE', '438', 'Liechtenstein', 'CHF', 'de-LI', '+423', 'unknown', 'unknown', 'unknown'],
  ['LK', 'LKA', '144', 'Sri Lanka', 'LKR', 'si-LK', '+94', 'required', 'required', 'province'],
  ['LR', 'LBR', '430', 'Liberia', 'LRD', 'en-LR', '+231', 'unknown', 'unknown', 'unknown'],
  ['LS', 'LSO', '426', 'Lesotho', 'LSL', 'en-LS', '+266', 'unknown', 'unknown', 'unknown'],
  ['LT', 'LTU', '440', 'Lithuania', 'EUR', 'lt-LT', '+370', 'unknown', 'unknown', 'unknown'],
  ['LU', 'LUX', '442', 'Luxembourg', 'EUR', 'fr-LU', '+352', 'unknown', 'unknown', 'unknown'],
  ['LV', 'LVA', '428', 'Latvia', 'EUR', 'lv-LV', '+371', 'unknown', 'unknown', 'unknown'],
  ['LY', 'LBY', '434', 'Libya', 'LYD', 'ar-LY', '+218', 'unknown', 'unknown', 'unknown'],
  ['MA', 'MAR', '504', 'Morocco', 'MAD', 'ar-MA', '+212', 'required', 'required', 'region'],
  ['MC', 'MCO', '492', 'Monaco', 'EUR', 'fr-MC', '+377', 'unknown', 'unknown', 'unknown'],
  ['MD', 'MDA', '498', 'Moldova', 'MDL', 'ro-MD', '+373', 'unknown', 'unknown', 'unknown'],
  ['ME', 'MNE', '499', 'Montenegro', 'EUR', 'sr-ME', '+382', 'unknown', 'unknown', 'unknown'],
  ['MF', 'MAF', '663', 'Saint Martin (French part)', 'EUR', 'fr-MF', '+590', 'unknown', 'unknown', 'unknown'],
  ['MG', 'MDG', '450', 'Madagascar', 'MGA', 'mg-MG', '+261', 'unknown', 'unknown', 'unknown'],
  ['MH', 'MHL', '584', 'Marshall Islands', 'USD', 'en-MH', '+692', 'unknown', 'unknown', 'unknown'],
  ['MK', 'MKD', '807', 'North Macedonia', 'MKD', 'mk-MK', '+389', 'unknown', 'unknown', 'unknown'],
  ['ML', 'MLI', '466', 'Mali', 'XOF', 'fr-ML', '+223', 'unknown', 'unknown', 'unknown'],
  ['MM', 'MMR', '104', 'Myanmar', 'MMK', 'my-MM', '+95', 'unknown', 'unknown', 'unknown'],
  ['MN', 'MNG', '496', 'Mongolia', 'MNT', 'mn-MN', '+976', 'unknown', 'unknown', 'unknown'],
  ['MO', 'MAC', '446', 'Macao', 'MOP', 'zh-MO', '+853', 'unknown', 'unknown', 'unknown'],
  ['MP', 'MNP', '580', 'Northern Mariana Islands', 'USD', 'en-MP', '+1670', 'unknown', 'unknown', 'unknown'],
  ['MQ', 'MTQ', '474', 'Martinique', 'EUR', 'fr-MQ', '+596', 'unknown', 'unknown', 'unknown'],
  ['MR', 'MRT', '478', 'Mauritania', 'MRU', 'ar-MR', '+222', 'unknown', 'unknown', 'unknown'],
  ['MS', 'MSR', '500', 'Montserrat', 'XCD', 'en-MS', '+1664', 'unknown', 'unknown', 'unknown'],
  ['MT', 'MLT', '470', 'Malta', 'EUR', 'mt-MT', '+356', 'unknown', 'unknown', 'unknown'],
  ['MU', 'MUS', '480', 'Mauritius', 'MUR', 'en-MU', '+230', 'unknown', 'unknown', 'unknown'],
  ['MV', 'MDV', '462', 'Maldives', 'MVR', 'dv-MV', '+960', 'unknown', 'unknown', 'unknown'],
  ['MW', 'MWI', '454', 'Malawi', 'MWK', 'en-MW', '+265', 'unknown', 'unknown', 'unknown'],
  ['MX', 'MEX', '484', 'Mexico', 'MXN', 'es-MX', '+52', 'required', 'required', 'state'],
  ['MY', 'MYS', '458', 'Malaysia', 'MYR', 'ms-MY', '+60', 'required', 'required', 'state'],
  ['MZ', 'MOZ', '508', 'Mozambique', 'MZN', 'pt-MZ', '+258', 'unknown', 'unknown', 'unknown'],
  ['NA', 'NAM', '516', 'Namibia', 'NAD', 'en-NA', '+264', 'unknown', 'unknown', 'unknown'],
  ['NC', 'NCL', '540', 'New Caledonia', 'XPF', 'fr-NC', '+687', 'unknown', 'unknown', 'unknown'],
  ['NE', 'NER', '562', 'Niger', 'XOF', 'fr-NE', '+227', 'unknown', 'unknown', 'unknown'],
  ['NF', 'NFK', '574', 'Norfolk Island', 'AUD', 'en-NF', '+672', 'unknown', 'unknown', 'unknown'],
  ['NG', 'NGA', '566', 'Nigeria', 'NGN', 'en-NG', '+234', 'optional', 'required', 'state'],
  ['NI', 'NIC', '558', 'Nicaragua', 'NIO', 'es-NI', '+505', 'unknown', 'unknown', 'unknown'],
  ['NL', 'NLD', '528', 'Netherlands', 'EUR', 'nl-NL', '+31', 'required', 'optional', 'province'],
  ['NO', 'NOR', '578', 'Norway', 'NOK', 'no-NO', '+47', 'required', 'optional', 'county'],
  ['NP', 'NPL', '524', 'Nepal', 'NPR', 'ne-NP', '+977', 'required', 'required', 'province'],
  ['NR', 'NRU', '520', 'Nauru', 'AUD', 'en-NR', '+674', 'unknown', 'unknown', 'unknown'],
  ['NU', 'NIU', '570', 'Niue', 'NZD', 'en-NU', '+683', 'unknown', 'unknown', 'unknown'],
  ['NZ', 'NZL', '554', 'New Zealand', 'NZD', 'en-NZ', '+64', 'required', 'optional', 'region'],
  ['OM', 'OMN', '512', 'Oman', 'OMR', 'ar-OM', '+968', 'not_used', 'required', 'region'],
  ['PA', 'PAN', '591', 'Panama', 'PAB', 'es-PA', '+507', 'unknown', 'unknown', 'unknown'],
  ['PE', 'PER', '604', 'Peru', 'PEN', 'es-PE', '+51', 'required', 'required', 'region'],
  ['PF', 'PYF', '258', 'French Polynesia', 'XPF', 'fr-PF', '+689', 'unknown', 'unknown', 'unknown'],
  ['PG', 'PNG', '598', 'Papua New Guinea', 'PGK', 'en-PG', '+675', 'unknown', 'unknown', 'unknown'],
  ['PH', 'PHL', '608', 'Philippines', 'PHP', 'en-PH', '+63', 'required', 'required', 'province'],
  ['PK', 'PAK', '586', 'Pakistan', 'PKR', 'en-PK', '+92', 'required', 'required', 'province'],
  ['PL', 'POL', '616', 'Poland', 'PLN', 'pl-PL', '+48', 'required', 'required', 'province'],
  ['PM', 'SPM', '666', 'Saint Pierre and Miquelon', 'EUR', 'fr-PM', '+508', 'unknown', 'unknown', 'unknown'],
  ['PN', 'PCN', '612', 'Pitcairn', 'NZD', 'en-PN', '+64', 'unknown', 'unknown', 'unknown'],
  ['PR', 'PRI', '630', 'Puerto Rico', 'USD', 'es-PR', '+1787', 'unknown', 'unknown', 'unknown'],
  ['PS', 'PSE', '275', 'Palestine, State of', 'ILS', 'ar-PS', '+970', 'unknown', 'unknown', 'unknown'],
  ['PT', 'PRT', '620', 'Portugal', 'EUR', 'pt-PT', '+351', 'required', 'optional', 'district'],
  ['PW', 'PLW', '585', 'Palau', 'USD', 'en-PW', '+680', 'unknown', 'unknown', 'unknown'],
  ['PY', 'PRY', '600', 'Paraguay', 'PYG', 'es-PY', '+595', 'unknown', 'unknown', 'unknown'],
  ['QA', 'QAT', '634', 'Qatar', 'QAR', 'ar-QA', '+974', 'not_used', 'optional', 'region'],
  ['RE', 'REU', '638', 'Réunion', 'EUR', 'fr-RE', '+262', 'unknown', 'unknown', 'unknown'],
  ['RO', 'ROU', '642', 'Romania', 'RON', 'ro-RO', '+40', 'required', 'required', 'county'],
  ['RS', 'SRB', '688', 'Serbia', 'RSD', 'sr-RS', '+381', 'unknown', 'unknown', 'unknown'],
  ['RU', 'RUS', '643', 'Russian Federation', 'RUB', 'ru-RU', '+7', 'unknown', 'unknown', 'unknown'],
  ['RW', 'RWA', '646', 'Rwanda', 'RWF', 'rw-RW', '+250', 'unknown', 'unknown', 'unknown'],
  ['SA', 'SAU', '682', 'Saudi Arabia', 'SAR', 'ar-SA', '+966', 'required', 'required', 'region'],
  ['SB', 'SLB', '090', 'Solomon Islands', 'SBD', 'en-SB', '+677', 'unknown', 'unknown', 'unknown'],
  ['SC', 'SYC', '690', 'Seychelles', 'SCR', 'fr-SC', '+248', 'unknown', 'unknown', 'unknown'],
  ['SD', 'SDN', '729', 'Sudan', 'SDG', 'ar-SD', '+249', 'unknown', 'unknown', 'unknown'],
  ['SE', 'SWE', '752', 'Sweden', 'SEK', 'sv-SE', '+46', 'required', 'optional', 'county'],
  ['SG', 'SGP', '702', 'Singapore', 'SGD', 'en-SG', '+65', 'required', 'optional', 'none'],
  ['SH', 'SHN', '654', 'Saint Helena, Ascension and Tristan da Cunha', 'SHP', 'en-SH', '+290', 'unknown', 'unknown', 'unknown'],
  ['SI', 'SVN', '705', 'Slovenia', 'EUR', 'sl-SI', '+386', 'unknown', 'unknown', 'unknown'],
  ['SJ', 'SJM', '744', 'Svalbard and Jan Mayen', 'NOK', 'no-SJ', '+47', 'unknown', 'unknown', 'unknown'],
  ['SK', 'SVK', '703', 'Slovakia', 'EUR', 'sk-SK', '+421', 'unknown', 'unknown', 'unknown'],
  ['SL', 'SLE', '694', 'Sierra Leone', 'SLE', 'en-SL', '+232', 'unknown', 'unknown', 'unknown'],
  ['SM', 'SMR', '674', 'San Marino', 'EUR', 'it-SM', '+378', 'unknown', 'unknown', 'unknown'],
  ['SN', 'SEN', '686', 'Senegal', 'XOF', 'fr-SN', '+221', 'unknown', 'unknown', 'unknown'],
  ['SO', 'SOM', '706', 'Somalia', 'SOS', 'so-SO', '+252', 'unknown', 'unknown', 'unknown'],
  ['SR', 'SUR', '740', 'Suriname', 'SRD', 'nl-SR', '+597', 'unknown', 'unknown', 'unknown'],
  ['SS', 'SSD', '728', 'South Sudan', 'SSP', 'en-SS', '+211', 'unknown', 'unknown', 'unknown'],
  ['ST', 'STP', '678', 'Sao Tome and Principe', 'STN', 'pt-ST', '+239', 'unknown', 'unknown', 'unknown'],
  ['SV', 'SLV', '222', 'El Salvador', 'USD', 'es-SV', '+503', 'unknown', 'unknown', 'unknown'],
  ['SX', 'SXM', '534', 'Sint Maarten (Dutch part)', 'ANG', 'en-SX', '+1721', 'unknown', 'unknown', 'unknown'],
  ['SY', 'SYR', '760', 'Syrian Arab Republic', 'SYP', 'ar-SY', '+963', 'unknown', 'unknown', 'unknown'],
  ['SZ', 'SWZ', '748', 'Eswatini', 'SZL', 'en-SZ', '+268', 'unknown', 'unknown', 'unknown'],
  ['TC', 'TCA', '796', 'Turks and Caicos Islands', 'USD', 'en-TC', '+1649', 'unknown', 'unknown', 'unknown'],
  ['TD', 'TCD', '148', 'Chad', 'XAF', 'fr-TD', '+235', 'unknown', 'unknown', 'unknown'],
  ['TF', 'ATF', '260', 'French Southern Territories', 'EUR', 'fr-TF', '+262', 'unknown', 'unknown', 'unknown'],
  ['TG', 'TGO', '768', 'Togo', 'XOF', 'fr-TG', '+228', 'unknown', 'unknown', 'unknown'],
  ['TH', 'THA', '764', 'Thailand', 'THB', 'th-TH', '+66', 'required', 'required', 'province'],
  ['TJ', 'TJK', '762', 'Tajikistan', 'TJS', 'tg-TJ', '+992', 'unknown', 'unknown', 'unknown'],
  ['TK', 'TKL', '772', 'Tokelau', 'NZD', 'en-TK', '+690', 'unknown', 'unknown', 'unknown'],
  ['TL', 'TLS', '626', 'Timor-Leste', 'USD', 'pt-TL', '+670', 'unknown', 'unknown', 'unknown'],
  ['TM', 'TKM', '795', 'Turkmenistan', 'TMT', 'tk-TM', '+993', 'unknown', 'unknown', 'unknown'],
  ['TN', 'TUN', '788', 'Tunisia', 'TND', 'ar-TN', '+216', 'unknown', 'unknown', 'unknown'],
  ['TO', 'TON', '776', 'Tonga', 'TOP', 'to-TO', '+676', 'unknown', 'unknown', 'unknown'],
  ['TR', 'TUR', '792', 'Turkey', 'TRY', 'tr-TR', '+90', 'required', 'required', 'province'],
  ['TT', 'TTO', '780', 'Trinidad and Tobago', 'TTD', 'en-TT', '+1868', 'unknown', 'unknown', 'unknown'],
  ['TV', 'TUV', '798', 'Tuvalu', 'AUD', 'en-TV', '+688', 'unknown', 'unknown', 'unknown'],
  ['TW', 'TWN', '158', 'Taiwan', 'TWD', 'zh-TW', '+886', 'unknown', 'unknown', 'unknown'],
  ['TZ', 'TZA', '834', 'Tanzania', 'TZS', 'sw-TZ', '+255', 'unknown', 'unknown', 'unknown'],
  ['UA', 'UKR', '804', 'Ukraine', 'UAH', 'uk-UA', '+380', 'unknown', 'unknown', 'unknown'],
  ['UG', 'UGA', '800', 'Uganda', 'UGX', 'en-UG', '+256', 'unknown', 'unknown', 'unknown'],
  ['UM', 'UMI', '581', 'United States Minor Outlying Islands', 'USD', 'en-UM', '+1', 'unknown', 'unknown', 'unknown'],
  ['US', 'USA', '840', 'United States of America', 'USD', 'en-US', '+1', 'required', 'required', 'state'],
  ['UY', 'URY', '858', 'Uruguay', 'UYU', 'es-UY', '+598', 'unknown', 'unknown', 'unknown'],
  ['UZ', 'UZB', '860', 'Uzbekistan', 'UZS', 'uz-UZ', '+998', 'unknown', 'unknown', 'unknown'],
  ['VA', 'VAT', '336', 'Holy See', 'EUR', 'it-VA', '+379', 'unknown', 'unknown', 'unknown'],
  ['VC', 'VCT', '670', 'Saint Vincent and the Grenadines', 'XCD', 'en-VC', '+1784', 'unknown', 'unknown', 'unknown'],
  ['VE', 'VEN', '862', 'Venezuela', 'VES', 'es-VE', '+58', 'unknown', 'unknown', 'unknown'],
  ['VG', 'VGB', '092', 'Virgin Islands (British)', 'USD', 'en-VG', '+1284', 'unknown', 'unknown', 'unknown'],
  ['VI', 'VIR', '850', 'Virgin Islands (U.S.)', 'USD', 'en-VI', '+1340', 'unknown', 'unknown', 'unknown'],
  ['VN', 'VNM', '704', 'Vietnam', 'VND', 'vi-VN', '+84', 'required', 'required', 'province'],
  ['VU', 'VUT', '548', 'Vanuatu', 'VUV', 'bi-VU', '+678', 'unknown', 'unknown', 'unknown'],
  ['WF', 'WLF', '876', 'Wallis and Futuna', 'XPF', 'fr-WF', '+681', 'unknown', 'unknown', 'unknown'],
  ['WS', 'WSM', '882', 'Samoa', 'WST', 'sm-WS', '+685', 'unknown', 'unknown', 'unknown'],
  ['YE', 'YEM', '887', 'Yemen', 'YER', 'ar-YE', '+967', 'unknown', 'unknown', 'unknown'],
  ['YT', 'MYT', '175', 'Mayotte', 'EUR', 'fr-YT', '+262', 'unknown', 'unknown', 'unknown'],
  ['ZA', 'ZAF', '710', 'South Africa', 'ZAR', 'en-ZA', '+27', 'required', 'required', 'province'],
  ['ZM', 'ZMB', '894', 'Zambia', 'ZMW', 'en-ZM', '+260', 'unknown', 'unknown', 'unknown'],
  ['ZW', 'ZWE', '716', 'Zimbabwe', 'ZWG', 'en-ZW', '+263', 'unknown', 'unknown', 'unknown']
];

const COUNTRY_MAP = new Map();
const ALPHA3_MAP = new Map();
const NUMERIC_MAP = new Map();

for (const [
  code, alpha3, numeric, name, defaultCurrency, defaultLocale, callingCode,
  postalPolicy, adminPolicy, adminType
] of RAW_COUNTRIES) {
  if (COUNTRY_MAP.has(code)) {
    throw new Error(`Duplicate ISO 3166-1 alpha-2 country code in registry: ${code}`);
  }
  if (ALPHA3_MAP.has(alpha3)) {
    throw new Error(`Duplicate ISO 3166-1 alpha-3 country code in registry: ${alpha3} (${code})`);
  }
  if (NUMERIC_MAP.has(numeric)) {
    throw new Error(`Duplicate ISO 3166-1 numeric country code in registry: ${numeric} (${code})`);
  }

  const entry = Object.freeze({
    code,
    alpha3,
    numeric,
    name,
    defaultCurrency,
    defaultLocale,
    callingCode,
    postalPolicy,
    postalCodeRequirement: postalPolicy,
    adminPolicy,
    administrativeAreaRequirement: adminPolicy,
    adminType,
    administrativeAreaType: adminType,
    provenance: REGISTRY_PROVENANCE
  });

  COUNTRY_MAP.set(code, entry);
  ALPHA3_MAP.set(alpha3, entry);
  NUMERIC_MAP.set(numeric, entry);
}

const TOTAL_REGISTERED_COUNT = COUNTRY_MAP.size;

class CountryRegistry {
  /**
   * Normalize country code string
   * @param {string} code
   * @returns {string}
   */
  static normalizeCode(code) {
    if (typeof code !== 'string') return '';
    return code.trim().toUpperCase();
  }

  /**
   * Retrieve versioned metadata for an ISO 3166-1 country code
   * @param {string} code - Alpha-2 (2 letters), Alpha-3 (3 letters), or 3-digit Numeric string
   * @returns {Readonly<{code: string, alpha3: string, numeric: string, name: string, defaultCurrency: string, defaultLocale: string, callingCode: string, postalPolicy: string, adminPolicy: string, adminType: string, provenance: Object}>}
   */
  static getCountry(code) {
    const normalized = this.normalizeCode(code);
    if (!normalized) {
      throw CommerceError.countryUnknown(code);
    }

    const entry = COUNTRY_MAP.get(normalized) || ALPHA3_MAP.get(normalized) || NUMERIC_MAP.get(normalized);
    if (!entry) {
      throw CommerceError.countryUnknown(normalized);
    }
    return entry;
  }

  /**
   * Check if country code exists
   * @param {string} code
   * @returns {boolean}
   */
  static hasCountry(code) {
    const normalized = this.normalizeCode(code);
    return COUNTRY_MAP.has(normalized) || ALPHA3_MAP.has(normalized) || NUMERIC_MAP.has(normalized);
  }

  /**
   * Check if postal code is strictly required by commerce policy
   * @param {string} code
   * @returns {boolean}
   */
  static isPostalCodeRequired(code) {
    const country = this.getCountry(code);
    return country.postalPolicy === 'required';
  }

  /**
   * Check if administrative area is strictly required by commerce policy
   * @param {string} code
   * @returns {boolean}
   */
  static isAdministrativeAreaRequired(code) {
    const country = this.getCountry(code);
    return country.adminPolicy === 'required';
  }

  /**
   * List all registered countries
   * @returns {Array<Readonly<Object>>}
   */
  static listCountries() {
    return Array.from(COUNTRY_MAP.values());
  }

  /**
   * Total registered entry count
   * @returns {number}
   */
  static getRegisteredCount() {
    return TOTAL_REGISTERED_COUNT;
  }

  /**
   * Get registry provenance metadata
   */
  static getRegistryProvenance() {
    return REGISTRY_PROVENANCE;
  }
}

module.exports = CountryRegistry;
