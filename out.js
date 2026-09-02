// src/utils/liveData.js
import { Capacitor } from "@capacitor/core";

// src/utils/stockmap.json
var stockmap_default = { USHL: { name: "Upper Syange Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, ACLBSL: { name: "Aarambha Chautari Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, ACLBSLP: { name: "Aarambha Chautari Laghubitta Bittiya Sanstha Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, ANLB: { name: "Aatmanirbhar Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, ANLBP: { name: "Aatmanirbhar Laghubitta Bittiya Sanstha Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, ADBL: { name: "Agricultural Development Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, ADBLD83: { name: "10.35% Agricultural Bank Debenture 2083", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, ADBLB: { name: "4% Agricultural Bond", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, ADBLB86: { name: "Agricultural Bond (8 Year)", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, ADBLB87: { name: "Agricultural Bond (9 Year)", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, AKJCL: { name: "Ankhu Khola Jalvidhyut Company Ltd", sector: "Hydro Power", internalSector: "HydroPower Index" }, API: { name: "Api Power Company Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, AKPL: { name: "Arun Kabeli Power Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, AHPC: { name: "Arun Valley Hydropower Development Co. Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, ALBSL: { name: "Asha Laghubitta Bittiya Sanstha Ltd", sector: "Microfinance", internalSector: "Microfinance Index" }, ALBSLP: { name: "Asha Laghubitta Bittiya Sanstha Ltd Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, AHL: { name: "Asian Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, ALICLP: { name: "Asian Life Insurance Co. Ltd Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, ALICL: { name: "Asian Life Insurance Co. Limited", sector: "Life Insurance", internalSector: "Life Insurance" }, AVYAN: { name: "Aviyan Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, AVYANP: { name: "Aviyan Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, BHL: { name: "Balephi Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, BANDIPUR: { name: "Bandipur Cablecar and Tourism Limited", sector: "Hotels And Tourism", internalSector: "Hotels And Tourism" }, BOKD86KA: { name: 'BOK Debenture 2086 "KA"', sector: "Commercial Banks", internalSector: "Banking SubIndex" }, BOKD86: { name: "8.5% BOK Debenture 2086", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, BHPL: { name: "Barahi Hydropower Public Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, BARUN: { name: "Barun Hydropower Co. Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, BFC: { name: "Best Finance Company Ltd.", sector: "Finance", internalSector: "Finance Index" }, BFCPO: { name: "Best Finance Co. Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, BGWT: { name: "Bhagawati Hydropower Development Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, BEDC: { name: "Bhugol Energy Development Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, BJHL: { name: "Bhujung Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, BHCL: { name: "Bikash Hydropower Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, BHDC: { name: "Bindhyabasini Hydropower Development Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, BBC: { name: "Bishal Bazar Company Limited", sector: "Tradings", internalSector: "Trading Index" }, BNL: { name: "Bottlers Nepal (Balaju) Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, BNT: { name: "Bottlers Nepal (Terai) Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, BNHC: { name: "Buddha Bhumi Nepal Hydropower Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, BUNGAL: { name: "Bungal Hydro Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, BPCL: { name: "Butwal Power Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, CMF2: { name: "CITIZENS MUTUAL FUND 2", sector: "Mutual Fund", internalSector: "Mutual Fund" }, CHDC: { name: "CEDB Holdings Limited", sector: "Investment", internalSector: "Investment" }, CFCL: { name: "Central Finance Co. Ltd.", sector: "Finance", internalSector: "Finance Index" }, CFCLPO: { name: "Central Finance Co. Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, CCBD88: { name: "Century Debenture 2088", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, CGH: { name: "Chandragiri Hills Limited", sector: "Hotels And Tourism", internalSector: "Hotels And Tourism" }, CBBLPO: { name: "Chhimek Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, CBBL: { name: "Chhimek Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, CHL: { name: "Chhyangdi Hydropower Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, CHCL: { name: "Chilime Hydropower Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, CKHL: { name: "Chirkhwa Hydropower Limited ", sector: "Hydro Power", internalSector: "HydroPower Index" }, CIT: { name: "Citizen Investment Trust", sector: "Investment", internalSector: "Investment" }, CITPO: { name: "Citizen Investment Trust Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, CLI: { name: "Citizen Life Insurance Company Limited", sector: "Life Insurance", internalSector: "Life Insurance" }, CSY: { name: "Citizens Santulit Yojana", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, C30MF: { name: "Citizens Super 30 Mutual Fund", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, CIZBD90: { name: "10% Citizens Bank Debenture 2090", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, CZBILP: { name: "Citizens Bank Internatioal Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, CZBIL: { name: "Citizens Bank International Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, CIZBD86: { name: "10.25% Citizens Bank Debenture 2086", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, CITY: { name: "City Hotel Limited", sector: "Hotels And Tourism", internalSector: "Hotels And Tourism" }, CBLD88: { name: "Civil Bank Debenture 2088", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, PSDBLP: { name: "Pashupati Development Bank Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, CORBL: { name: "Corporate Development Bank Limited", sector: "Development Banks", internalSector: "Development Bank Ind." }, CORBLP: { name: "Corporate Development Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, CREST: { name: "Crest Micro Life Insurance Limited", sector: "Life Insurance", internalSector: "Life Insurance" }, CRESTP: { name: "Crest Micro Life Insurance Limited Promoter share", sector: "Promoter Share", internalSector: "Promoter Share" }, CYCL: { name: "CYC Nepal Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, CYCLP: { name: "CYC Nepal Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, DHEL: { name: "Daramkhola Hydro Energy Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, DDBL: { name: "Deprosc Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, DDBLPO: { name: "Deprosc LaghuBitta Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, DLBS: { name: "Dhaulagiri Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, DHPL: { name: "Dibyashwori Hydropower Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, DOLTI: { name: "Dolti Power Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, DORDI: { name: "Dordi Khola Jal Bidyut Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, EHPL: { name: "Eastern Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, ENL: { name: "Emerging Nepal Limited", sector: "Investment", internalSector: "Investment" }, EBL: { name: "Everest Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, EBLPO: { name: "Everest Bank Ltd.Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, EBLD86: { name: "Everest Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, EBLD85: { name: "10.50% Everest Bank Limited Debenture 2085", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, EBLEB89: { name: "Everest Bank Limited Energy Bond, 2089", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, EBLD91: { name: "Everest Bank Limited Debenture 2091", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, EDBLPO: { name: "Excel Development Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, EDBL: { name: "Excel Development Bank Ltd.", sector: "Development Banks", internalSector: "Development Bank Ind." }, FMDBL: { name: "First Micro Finance Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, FMDBLP: { name: "First Micro Finance Laghubitta Bittiya Sanstha Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, FOWAD: { name: "Forward Microfinance Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, FOWADP: { name: "Forward Microfinance Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, GMFBS: { name: "Ganapati Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, GMFBSP: { name: "Ganapati Laghubitta Bittiya Sanstha Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, GBBL: { name: "Garima Bikas Bank Limited", sector: "Development Banks", internalSector: "Development Bank Ind." }, GBBLPO: { name: "Garima Bikas Bank Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, GSY: { name: "Garima Samriddhi Yojana", sector: "Development Banks", internalSector: "Development Bank Ind." }, GBBD85: { name: "Garima Debenture, 2085", sector: "Development Banks", internalSector: "Development Bank Ind." }, GHL: { name: "Ghalemdi Hydro Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, GCIL: { name: "Ghorahi Cement Industry Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, GIBF1: { name: "Global IME Balanced Fund-1", sector: "Mutual Fund", internalSector: "Mutual Fund" }, GBIME: { name: "Global IME Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, GBIMEP: { name: "Global IME Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, GBIMESY2: { name: "Global IME Sammunat Yojana -2", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, "GBILD86/87": { name: "Global IME Bank Limited Debenture 2086/87", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, "GBILD84/85": { name: "Global IME Bank Debenture, 2084/85", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, GILB: { name: "Global IME Laghubitta Bittiya Sanstha Ltd.", sector: "Microfinance", internalSector: "Microfinance Index" }, GILBPO: { name: "Global IME Laghubitta Bittiya Sanstha Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, GFCL: { name: "Goodwill Finance Limited", sector: "Finance", internalSector: "Finance Index" }, GFCLPO: { name: "Goodwill Finance Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, GWFD83: { name: "12 % Goodwill Finance Limited Debenture 2083", sector: "Finance", internalSector: "Finance Index" }, GBLBS: { name: "Grameen Bikas Laghubitta Bittiya Sanstha Ltd.", sector: "Microfinance", internalSector: "Microfinance Index" }, PDBLPO: { name: "Paschimanchal Bikash Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, GBLBSP: { name: "Grameen Bikas Laghubitta Bittiya Sanstha Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, GRDBL: { name: "Green Development Bank Ltd.", sector: "Development Banks", internalSector: "Development Bank Ind." }, GRDBLP: { name: "Green Development Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, GVL: { name: "Green Ventures Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, GLH: { name: "GreenLife Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, GMLI: { name: "Guardian Micro Life Insurance Limited ", sector: "Life Insurance", internalSector: "Life Insurance" }, GMLIP: { name: "Guardian Micro Life Insurance Limited  Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, GMFIL: { name: "Guheshowori Merchant Bank & Finance Co. Ltd.", sector: "Finance", internalSector: "Finance Index" }, GMFILP: { name: "Guheyshwori Merchant & Finance Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, GLBSL: { name: "Gurans Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, GUFL: { name: "Gurkhas Finance Ltd.", sector: "Finance", internalSector: "Finance Index" }, GUFLPO: { name: "Gurkhas Finance  Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, HATHY: { name: "Hathway Investment Nepal Limited", sector: "Investment", internalSector: "Investment" }, HDHPC: { name: "Himal Dolakha Hydropower Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, HURJA: { name: "Himalaya Urja Bikas Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, HBLD86: { name: "Himalayan Bank Limited Bond, 2086", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, H8020: { name: "Himalayan 80-20", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, HBLD83: { name: "10% Himalayan Bank Debenture 2083", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, HBL: { name: "Himalayan Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, HBLPO: { name: "Himalayan Bank Ltd. Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, HDL: { name: "Himalayan Distillery Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, HEI: { name: "Himalayan Everest Insurance Limited", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, HEIP: { name: "Himalayan Everest Insurance Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, HHL: { name: "Himalayan Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, HLBSLP: { name: "Himalayan Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, HLBSL: { name: "Himalayan Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, HLI: { name: "Himalayan Life Insurance Limited", sector: "Life Insurance", internalSector: "Life Insurance" }, HLIPO: { name: "Himalayan Life Insurance Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, HLICF: { name: "HLI Large Cap Fund", sector: "Life Insurance", internalSector: "Life Insurance" }, HPPL: { name: "Himalayan Power Partner Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, HRL: { name: "Himalayan Reinsurance Limited", sector: "Others", internalSector: "Others Index" }, HIMSTAR: { name: "Him Star Urja Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, HFIN: { name: "Hotel Forest Inn Limited", sector: "Hotels And Tourism", internalSector: "Hotels And Tourism" }, HIDCL: { name: "Hydorelectricity Investment and Development Company Ltd", sector: "Investment", internalSector: "Investment" }, HIDCLP: { name: "Hydorelectricity Investment and Development Company Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, ILI: { name: "IME Life Insurance Company Limited", sector: "Life Insurance", internalSector: "Life Insurance" }, ILIP: { name: "IME Life Insurance Company Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, ICFC: { name: "ICFC Finance Limited", sector: "Finance", internalSector: "Finance Index" }, ICFCPO: { name: "ICFC Finance Limited Promotor Share", sector: "Promoter Share", internalSector: "Promoter Share" }, ICFCD83: { name: "12% ICFC Finance Limited Debenture 2083", sector: "Finance", internalSector: "Finance Index" }, ICFCD89: { name: "8% ICFC Finance Limited Debenture 2089", sector: "Finance", internalSector: "Finance Index" }, ICFCD88: { name: "9% ICFC Finance Limited Debenture 2088", sector: "Finance", internalSector: "Finance Index" }, IGIPO: { name: "IGI Prudential insurance Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, IGI: { name: "IGI Prudential insurance Limited", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, ILBS: { name: "Infinity Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, ILBSP: { name: "Infinity Laghubitta Bittiya Sanstha Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, IHL: { name: "Ingwa Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, JFL: { name: "Janaki Finance Company Limited", sector: "Finance", internalSector: "Finance Index" }, JFLPO: { name: "Janaki Finance Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, JSLBB: { name: "Janautthan Samudayic Laghubitta Bittya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, JSLBBP: { name: "Janautthan Samudayic Laghubitta Bikas Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, JBLBP: { name: "Jeevan Bikas Laghubitta  Bittya Sanstha Ltd Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, JBLB: { name: "Jeevan Bikas Laghubitta  Bittya Sanstha Ltd", sector: "Microfinance", internalSector: "Microfinance Index" }, JHAPA: { name: "Jhapa Energy Limited", sector: "Others", internalSector: "Others Index" }, JOSHI: { name: "Joshi Hydropower Development Company Ltd", sector: "Hydro Power", internalSector: "HydroPower Index" }, JBBD87: { name: "Jyoti Bikash Bank Bond 2087", sector: "Development Banks", internalSector: "Development Bank Ind." }, JBBLPO: { name: "Jyoti Bikash  Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, JBBL: { name: "Jyoti Bikas Bank Limited", sector: "Development Banks", internalSector: "Development Bank Ind." }, KMCDB: { name: "Kalika Laghubitta Bittiya Sanstha Ltd", sector: "Microfinance", internalSector: "Microfinance Index" }, KMCDBP: { name: "Kalika Laghubitta Bittiya Sanstha Ltd Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, KPCL: { name: "Kalika power Company Ltd", sector: "Hydro Power", internalSector: "HydroPower Index" }, KDL: { name: "Kalinchowk Darshan Limited", sector: "Hotels And Tourism", internalSector: "Hotels And Tourism" }, KSBBLP: { name: "Kamana Sewa Bikas Bank Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, KSBBL: { name: "Kamana Sewa Bikas Bank Limited", sector: "Development Banks", internalSector: "Development Bank Ind." }, KSBBLD87: { name: "9% Kamana Sewa Bikas Bank Limited Debenture 2087", sector: "Development Banks", internalSector: "Development Bank Ind." }, KSBBLPNP: { name: "KSBBL 9% Perpetual Non Cumulative Preference Share", sector: "Development Banks", internalSector: "Development Bank Ind." }, KKHC: { name: "Khanikhola Hydropower Co. Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, KBLD86: { name: "10.25% KBL Debenture 2086", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, KEF: { name: "Kumari Equity Fund", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, KBLPO: { name: "Kumari Bank Limited Promotor Share", sector: "Promoter Share", internalSector: "Promoter Share" }, KBL: { name: "Kumari Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, KBLD89: { name: "11% KBL Debenture 2089", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, KDBY: { name: "Kumari Dhanabriddhi Yojana", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, KBLD90: { name: "10% KBL Debenture 2090", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, KSY: { name: "Kumari Sabal Yojana", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, KBSH: { name: "Kutheli Bukhari Small Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, LUK: { name: "Laxmi Unnati Kosh", sector: "Mutual Fund", internalSector: "Mutual Fund" }, LLBSPO: { name: "Laxmi Laghubitta Bittiya Sanstha Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, LLBS: { name: "Laxmi Laghubitta Bittiya Sanstha Ltd.", sector: "Microfinance", internalSector: "Microfinance Index" }, LBLD88: { name: "8.5% Laxmi Bank Debenture 2088", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, LVF2: { name: "Laxmi Value Fund 2", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, LSL: { name: "Laxmi Sunrise Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, LSLPO: { name: "Laxmi Sunrise Bank Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, LBLD86: { name: "10% Laxmi Bank Debenture 2086", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SFMF: { name: "Sunrise First Mutual Fund", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, LEC: { name: "Liberty Energy Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, LICN: { name: "Life Insurance Corporation (Nepal) Limited", sector: "Life Insurance", internalSector: "Life Insurance" }, LICNPO: { name: "Life Insurance Corporation (Nepal) Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, LBBLD89: { name: "11% L.B.B.L. Debenture 2089", sector: "Development Banks", internalSector: "Development Bank Ind." }, LBBL: { name: "Lumbini Bikas Bank Ltd.", sector: "Development Banks", internalSector: "Development Bank Ind." }, LBBLPO: { name: "Lumbini Bikas Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, MABEL: { name: "Mabilung Energy Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MBLD2085: { name: "10.25% Machhapuchhre Bank Debenture 2085", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, MBLPO: { name: "MachhaPuchhre  Bank Limited Promotor Share", sector: "Promoter Share", internalSector: "Promoter Share" }, MBL: { name: "Machhapuchhre Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, MBLEF: { name: "MBL Equity Fund", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, MBLD87: { name: "8.5% Machhapuchchhre Debenture 2087", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, MBJC: { name: "Madhya Bhotekoshi Jalavidyut Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MLBLD89: { name: "11% Mahalaxmi Debenture 2089", sector: "Development Banks", internalSector: "Development Bank Ind." }, MLBL: { name: "Mahalaxmi Bikas Bank Ltd.", sector: "Development Banks", internalSector: "Development Bank Ind." }, MLBLPO: { name: "Mahalxmi Bikas Bank Ltd. Promotor Share", sector: "Promoter Share", internalSector: "Promoter Share" }, MDBLPO: { name: "Malika Development Bank Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, MLBSL: { name: "Mahila Lagubitta Bittiya Sanstha Limited ", sector: "Microfinance", internalSector: "Microfinance Index" }, MLBSLP: { name: "Mahila Lagubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, MSLB: { name: "Mahuli Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, MSLBP: { name: "Mahuli Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, MKHL: { name: "Mai Khola Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MKJC: { name: "Mailung Khola Jal Vidhyut Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MAKAR: { name: "Makar Jitumaya Suri Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MEHL: { name: "Manakamana Engineering Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MHL: { name: "Mandakini Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MANDU: { name: "Mandu Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MFILPO: { name: "Manjushree Finance Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, MFLD85: { name: "9.5% Manjushree Finance Limited Debenture 2085", sector: "Finance", internalSector: "Finance Index" }, MFIL: { name: "Manjushree Finance Ltd.", sector: "Finance", internalSector: "Finance Index" }, MLBS: { name: "Manushi Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, MLBSP: { name: "Manushi Laghubitta Bittiya Sanstha Limited Promoter ", sector: "Promoter Share", internalSector: "Promoter Share" }, MMKJL: { name: "Mathillo Mailun Khola Jalvidhyut Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MATRI: { name: "Matribhumi Lagubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, MATRIP: { name: "Matribhumi Lagubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, MKHC: { name: "Maya Khola Hydropower Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MMF1: { name: "Mega Mutual Fund -1", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, MCHL: { name: "Menchhiyam Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MERO: { name: "Mero Microfinance Bittiya Sanstha Ltd.", sector: "Microfinance", internalSector: "Microfinance Index" }, MEROPO: { name: "Mero Microfinance Bittiya Sanstha Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, MSHL: { name: "Mid Solu Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MDB: { name: "Miteri Development Bank Limited", sector: "Development Banks", internalSector: "Development Bank Ind." }, MDBPO: { name: "Miteri Development Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, MLBBLP: { name: "Mithila LaghuBitta Bikas Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, MLBBL: { name: "Mithila LaghuBitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, MEL: { name: "Modi Energy Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MHCL: { name: "Molung Hydropower Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MEN: { name: "Mountain Energy Nepal Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, MHNL: { name: "Mountain Hydro Nepal Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, "MND84/85": { name: "Muktinath Debenture 2084/85", sector: "Development Banks", internalSector: "Development Bank Ind." }, MNMF1: { name: "Muktinath Mutual Fund 1", sector: "Development Banks", internalSector: "Development Bank Ind." }, MNBBL: { name: "Muktinath Bikas Bank Ltd.", sector: "Development Banks", internalSector: "Development Bank Ind." }, MNBBLP: { name: "Muktinath Bikas Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, MKCL: { name: "Muktinath Krishi Company Limited", sector: "Others", internalSector: "Others Index" }, MPFL: { name: "Multipurpose Finance Company  Limited", sector: "Finance", internalSector: "Finance Index" }, MPFLPO: { name: "Multipurpose Finance Company  Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NABIL: { name: "Nabil Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NABILP: { name: "NABIL Bank Limited Promotor Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NBF2: { name: "NABIL BALANCED FUND-2", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NBLD82: { name: "10% Nabil Debenture 2082", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NBF3: { name: "Nabil Balanced Fund-3", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NBLD85: { name: "Nabil Debenture 2085", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NABILD87: { name: "9% Nabil Debenture 2087", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NABILD2089: { name: "7% Nabil Debenture 2089", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NABILPNP: { name: "Nabil 8% Perpetual Non Cumulative Preference Share", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NADEP: { name: "Nadep Laghubittiya bittya Sanstha Ltd.", sector: "Microfinance", internalSector: "Microfinance Index" }, NADEPP: { name: "Nadep Laghubitta Bittiya Sanstha Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NABBCP: { name: "Narayani Development Bank Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, NABBC: { name: "Narayani Development Bank Limited", sector: "Development Banks", internalSector: "Development Bank Ind." }, NMFBS: { name: "National Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, NMFBSP: { name: "National Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, NHPC: { name: "National Hydro Power Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, NLICLP: { name: "National Life Insurance Co. Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NLICL: { name: "National Life Insurance Co. Ltd.", sector: "Life Insurance", internalSector: "Life Insurance" }, NIL: { name: "Neco Insurance Limited", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, NILPO: { name: "Neco Insurace Co. Ltd. Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, NBBD2085: { name: "10.25% NBBL Debenture 2085", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NBL: { name: "Nepal Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NBLP: { name: "Nepal Bank Limited Promotor share", sector: "Promoter Share", internalSector: "Promoter Share" }, NBLD87: { name: "8.5% Nepal Bank Debenture 2087", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NCCD86: { name: "9.5% NCC Debenture 2086", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NTC: { name: "Nepal Doorsanchar Company Limited", sector: "Others", internalSector: "Others Index" }, NFSPO: { name: "Nepal Finance Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NFS: { name: "Nepal Finance Ltd.", sector: "Finance", internalSector: "Finance Index" }, NHDL: { name: "Nepal Hydro Developers Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, NIFRA: { name: "Nepal Infrastructure Bank Limited", sector: "Investment", internalSector: "Investment" }, NIFRAP: { name: "Nepal Infrastructure Bank Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, NIFRAGED: { name: "Nifra Green Energy Debenture 6% - 2088/89", sector: "Investment", internalSector: "Investment" }, "NIFRAUR85/86": { name: "NIFRA Uraj Rinpatra7%-2085/86", sector: "Investment", internalSector: "Investment" }, NICL: { name: "Nepal Insurance Co. Ltd.", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, NICLPO: { name: "Nepal Insurance Co. Ltd Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NIMBD90: { name: "10% NIMB Debenture 2090", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NIBLSTF: { name: "NIBL Stable Fund", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NIBSF2: { name: "NIBL Samriddhi Fund -2", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NIBD84: { name: "8.5% Nepal Investment Bank Debenture 2084", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NIBD2082: { name: "10.5 % NEPAL INVESTMENT DEBENTURE 2082", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NIMB: { name: "Nepal Investment Mega Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NIMBPO: { name: "Nepal Investment Mega Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NLIC: { name: "Nepal Life Insurance Co. Ltd.", sector: "Life Insurance", internalSector: "Life Insurance" }, NLICP: { name: "Nepal Life Insurance Co. Ltd. Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, NSY: { name: "Nepal Life Samriddhi Lagani Yojana", sector: "Life Insurance", internalSector: "Life Insurance" }, NLO: { name: "Nepal Lube Oil Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, NMIC: { name: "Nepal Micro Insurance Company Limited", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, NMICP: { name: "Nepal Micro Insurance Company Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NRIC: { name: "Nepal Reinsurance Company Limited", sector: "Others", internalSector: "Others Index" }, NRICP: { name: "Nepal Reinsurance Company Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NRM: { name: "Nepal Republic Media Limited", sector: "Others", internalSector: "Others Index" }, SBI: { name: "Nepal SBI Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SBIPO: { name: "Nepal SBI Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SBIBD86: { name: "10% Nepal SBI Bank Debenture 2086", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SBID2090: { name: "7% Nepal SBI Bank Debenture 2090", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SBID89: { name: "9% Nepal SBI Bank Rinpatra 2089", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SBID83: { name: "10.25% Nepal SBI Bank Debenture 2083", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NSMPO: { name: "Nepal Share Markets Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NWCL: { name: "Nepal Warehousing Company Limited ", sector: "Others", internalSector: "Others Index" }, NMLBBLP: { name: "Nerude Mirmire Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, NMLBBL: { name: "Nerude Mirmire Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, NESDO: { name: "NESDO Sambridha Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, NESDOP: { name: "NESDO Sambridha Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, NGPL: { name: "Ngadi Group Power Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, NIBLGF: { name: "NIBL Growth Fund", sector: "Mutual Fund", internalSector: "Mutual Fund" }, NICD88: { name: "NIC ASIA Rinpatra 2088", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NICFC: { name: "NIC Asia Flexi CAP Fund", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NICGF2: { name: "NIC ASIA Growth Fund-2", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NICAD2091: { name: "7% NIC ASIA Debenture 2091", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NICA: { name: "NIC Asia Bank Ltd.", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NICAP: { name: "NIC Asia Bank Limted Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, "NICD83/84": { name: "10.25% NIC Asia Debenture 2083/84", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, "NICAD85/86": { name: "10% NIC Asia Debenture 2085/86", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NICBF: { name: "NIC Asia Balanced Fund", sector: "Mutual Fund", internalSector: "Mutual Fund" }, NICSF: { name: "NIC Asia Select Fund 30", sector: "Mutual Fund", internalSector: "Mutual Fund" }, NICLBSL: { name: "NIC ASIA Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, NICLBSLP: { name: "NIC ASIA Laghubitta Bittiya Sanstha Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NUBL: { name: "Nirdhan Utthan Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, NUBLPO: { name: "Nirdhan Utthan Laghubitta Bittiya Sanstha Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NLGPO: { name: "NLG Insurance Company Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NLG: { name: "NLG Insurance Company Ltd.", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, NMBMFP: { name: "NMB  Microfinance Bittiya Sanstha Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NMBMF: { name: "NMB  Microfinance Bittiya Sanstha Ltd.", sector: "Microfinance", internalSector: "Microfinance Index" }, NMBPO: { name: "NMB Bank Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, NMB: { name: "NMB Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NMBD2085: { name: "10 % NMB DEBENTURE 2085", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NMBHF2: { name: "NMB Hybrid Fund L- II", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, "NMBUR93/94": { name: "NMB Energy Bond 4% - 2093/94 ", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, "NMBD87/88": { name: "NMB Debenture 8.50% - 2087/88", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, "NMBEB92/93": { name: "NMB Energy Bond 4% - 2092/93", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, "NMBD89/90": { name: "NMB Debenture 10.75%-2089/90", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, NSIF2: { name: "NMB Sulav Investment Fund - 2", sector: "Mutual Fund", internalSector: "Mutual Fund" }, NMB50: { name: "NMB 50", sector: "Mutual Fund", internalSector: "Mutual Fund" }, NRN: { name: "NRN Infrastructure and Development Limited", sector: "Investment", internalSector: "Investment" }, NYADI: { name: "Nyadi Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, OMPL: { name: "Om Megashree Pharmaceuticals Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, OHL: { name: "Oriental Hotels Limited", sector: "Hotels And Tourism", internalSector: "Hotels And Tourism" }, PCIL: { name: "Palpa Cement Industries Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, PMHPL: { name: "Panchakanya Mai Hydropower Ltd", sector: "Hydro Power", internalSector: "HydroPower Index" }, PPCL: { name: "Panchthar Power Compant Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, PHCL: { name: "Peoples Hydropower Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, PPL: { name: "People's Power Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, PFL: { name: "Pokhara Finance Ltd.", sector: "Finance", internalSector: "Finance Index" }, PFLPO: { name: "Pokhara Finance Company Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, PRVU: { name: "Prabhu  Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, PRFLPO: { name: "Prabhu Finance Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, PRVUPO: { name: "Prabhu  Bank Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, PBLD86: { name: "10.25% Prabhu Bank  Debenture 2086", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, PBLD84: { name: "10% Prabhu Bank Debenture 2084 ", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, PBLD87: { name: "8.5% Prabhu Bank Debenture 2087", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, PSF: { name: "Prabhu Select Fund", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, PRSF: { name: "Prabhu Smart Fund", sector: "Mutual Fund", internalSector: "Mutual Fund" }, PRINPO: { name: "Prabhu Insurance Company Ltd. Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, PRIN: { name: "Prabhu Insurance Ltd.", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, PMLI: { name: "Prabhu Mahalaxmi Life Insurance Limited", sector: "Life Insurance", internalSector: "Life Insurance" }, PMLIP: { name: "Prabhu Mahalaxmi Life Insurance Limited promotor", sector: "Promoter Share", internalSector: "Promoter Share" }, PCBLP: { name: "Prime Commercial Bank Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, PCBL: { name: "Prime Commercial Bank Ltd.", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, PBD85: { name: "8.75 % Prime Debenture 2085", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, PBD84: { name: "10.15% Prime Debenture 2084", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, PBD88: { name: "10% Prime Debenture 2088", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, PROFL: { name: "Progressive Finance Limited", sector: "Finance", internalSector: "Finance Index" }, PROFLP: { name: "Progressive Finance Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, PURE: { name: "Pure Energy Limited", sector: "Others", internalSector: "Others Index" }, RADHI: { name: "Radhi Bidyut Company Ltd", sector: "Hydro Power", internalSector: "HydroPower Index" }, RHGCL: { name: "Rapti Hydro And General Construction Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, RBBD83: { name: "8.5% RBBL Debenture 2083", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, RBBD2088: { name: "7% RBBL Debenture 2088", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, RBCL: { name: "Rastriya Beema Company Limited", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, RBCLPO: { name: "Rastriya Beema Company Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, RHPL: { name: "RASUWAGADHI HYDROPOWER COMPANY LIMITED", sector: "Hydro Power", internalSector: "HydroPower Index" }, RAWA: { name: "Rawa Energy Development Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, RMF1: { name: "RBB Mutual Fund 1", sector: "Mutual Fund", internalSector: "Mutual Fund" }, RMF2: { name: "RBB Mutual Fund 2", sector: "Mutual Fund", internalSector: "Mutual Fund" }, RBBF40: { name: "RBB Focus 40", sector: "Mutual Fund", internalSector: "Mutual Fund" }, RSY: { name: "Reliable Samriddhi Yojana", sector: "Life Insurance", internalSector: "Life Insurance" }, RNLI: { name: "Reliable Nepal Life Insurance Limited", sector: "Life Insurance", internalSector: "Life Insurance" }, RLFL: { name: "Reliance Finance Ltd.", sector: "Finance", internalSector: "Finance Index" }, RLFLPO: { name: "Reliance Finance Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, RSML: { name: "Reliance Spinning Mills Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, RLEL: { name: "Ridge Line Energy Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, RIDI: { name: "Ridi Power Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, RFPL: { name: "River Falls Power Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, RSDC: { name: "RSDC Laghubitta Bittiya Sanstha Ltd.", sector: "Microfinance", internalSector: "Microfinance Index" }, RSDCP: { name: "RSDC Laghubitta Bittiya Sanstha Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, RURU: { name: "Ru Ru Jalbidhyut Pariyojana Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SAGAR: { name: "Sagar Distillery Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, SMJC: { name: "Sagarmatha Jalabidhyut Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SALICO: { name: "Sagarmatha Lumbini Insurance Co. Limited", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, SALICOPO: { name: "Sagarmatha Lumbini Insurance Co. Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SAHAS: { name: "Sahas Urja Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SABBL: { name: "Salapa Bikas Bank Limited", sector: "Development Banks", internalSector: "Development Bank Ind." }, STC: { name: "Salt Trading Corporation", sector: "Tradings", internalSector: "Trading Index" }, SMATA: { name: "Samata Gharelu Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, SMATAP: { name: "Samata Gharelu Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, SPC: { name: "Samling Power Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SMPDA: { name: "Sampada Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, SMPDAP: { name: "Sampada Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, SFCL: { name: "Samriddhi Finance Company Limited", sector: "Finance", internalSector: "Finance Index" }, SFCLP: { name: "Samriddhi Finance Company Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SLBSL: { name: "Samudayik Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, SLBSLPO: { name: "Samudayik Laghubitta Bittiya Sanstha Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SKBBL: { name: "Sana Kisan Bikas Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, SKBBLP: { name: "Sana Kisan Bikas Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, SNMAPO: { name: "Sanima Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SANIMA: { name: "Sanima Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SAND2085: { name: "10% Sanima Bank Limited Debenture", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SBD87: { name: "8.5% Sanima Debenture 2087", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SLCF: { name: "Sanima Large Cap Fund", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SBD89: { name: "10.25% Sanima Debenture 2089", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SGIC: { name: "Sanima GIC Insurance Limited", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, SGICP: { name: "Sanima GIC Insurance Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SAGF: { name: "Sanima Growth Fund", sector: "Mutual Fund", internalSector: "Mutual Fund" }, SHPC: { name: "Sanima Mai Hydropower Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, TAMOR: { name: "Sanima Middle Tamor Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SRLI: { name: "Sanima Reliance Life Insurance Limited", sector: "Life Insurance", internalSector: "Life Insurance" }, SRLIP: { name: "Sanima Reliance Life Insurance Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SJCL: { name: "SANJEN JALAVIDHYUT COMPANY LIMITED", sector: "Hydro Power", internalSector: "HydroPower Index" }, SANVI: { name: "Sanvi Energy Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SAPDBL: { name: "Saptakoshi Development Bank Ltd", sector: "Development Banks", internalSector: "Development Bank Ind." }, SAPDBLP: { name: "Saptakoshi Development Bank Ltd Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SARBTM: { name: "Sarbottam Cement Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, SPHL: { name: "Sayapatri Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SADBLP: { name: "Shangrila Development Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SADBL: { name: "Shangrila Development Bank Ltd.", sector: "Development Banks", internalSector: "Development Bank Ind." }, SDBD87: { name: "Shangri-la Development Bank Debenture 2087", sector: "Development Banks", internalSector: "Development Bank Ind." }, SICL: { name: "Shikhar Insurance Co. Ltd.", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, SICLPO: { name: "Shikhar Insurance Co. Ltd. Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, SIPD: { name: "Shikhar power Development Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SHINED: { name: "Shine Resunga Debenture", sector: "Development Banks", internalSector: "Development Bank Ind." }, SHINEP: { name: "Shine Resunga Development Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SHINE: { name: "Shine Resunga Development Bank Ltd.", sector: "Development Banks", internalSector: "Development Bank Ind." }, SSHL: { name: "Shiva Shree Hydropower Ltd", sector: "Hydro Power", internalSector: "HydroPower Index" }, SHIVM: { name: "SHIVAM CEMENTS LTD", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, SIFC: { name: "Shree Investment Finance Co. Ltd.", sector: "Finance", internalSector: "Finance Index" }, SIFCPO: { name: "Shree Investment & Finance Co. Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SAIL: { name: "Shreenagar Agritech Industries Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, SHLB: { name: "Shrijanshil Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, SHLBP: { name: "Shrijanshil Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, SPL: { name: "Shuvam Power Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SBLD84: { name: "8.5% SBL Debenture 2084", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SBLD83: { name: "10.25% SBL Debenture 2083", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SIGS2: { name: "Siddhartha Investment Growth Scheme - 2", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SEF: { name: "Siddhartha Equity Fund", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SBL: { name: "Siddhartha Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SBLPO: { name: "Siddhartha Bank Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SBLD2091: { name: "7.25% SBL Debenture 2091", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SBLPNP: { name: "SBL 8.25% Perpetual Non Cumulative Preference Share", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SBLD89: { name: "10.75% SBL Debenture 2089", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SIGS3: { name: "Siddhartha Investment Growth Scheme 3", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SPIL: { name: "Siddhartha Premier Insurance Limited", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, SPILPO: { name: "Siddhartha Premier Insurance Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SIKLES: { name: "Sikles Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SINDU: { name: "Sindhu Bikash Bank Ltd", sector: "Development Banks", internalSector: "Development Bank Ind." }, SINDUP: { name: "Sindhu Bikas Bank Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SHEL: { name: "Singati Hydro Energy Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SHL: { name: "Soaltee Hotel Limited", sector: "Hotels And Tourism", internalSector: "Hotels And Tourism" }, SOHL: { name: "Solu Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SONA: { name: "Sonapur Minerals And Oil Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, SCB: { name: "Standard Chartered Bank Limited", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SCBPO: { name: "Standard Chartered Bank Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SCBD: { name: "10.30% Standard Chartered Bank Limited Debenture", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SNLI: { name: "Sun Nepal Life Insurance Company Limited", sector: "Life Insurance", internalSector: "Life Insurance" }, SBCF: { name: "Sunrise Bluechip Fund", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SRBLD83: { name: "10.25% Sunrise Bank Debenture 2083", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SFEF: { name: "Sunrise Focused Equity Fund", sector: "Commercial Banks", internalSector: "Banking SubIndex" }, SKHL: { name: "Super Khudi Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SMHL: { name: "Super Madi Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SMH: { name: "Super Mai Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SMB: { name: "Support Microfinance Bittiya Sanstha Ltd.", sector: "Microfinance", internalSector: "Microfinance Index" }, SMBPO: { name: "Support Microfinance Bittiya Sanstha Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SJLICP: { name: "SuryaJyoti Life Insurance Company Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, SJLIC: { name: "SuryaJyoti Life Insurance Company Limited", sector: "Life Insurance", internalSector: "Life Insurance" }, SKHEL: { name: "Suryakunda Hydro Electric Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, SWMFPO: { name: "Suryodaya Womi Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, SWMF: { name: "Suryodaya Womi Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, SWBBL: { name: "Swabalamban Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, SWBBLP: { name: "Swabalamban Laghubitta Bittiya Sanstha Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SMFBS: { name: "Swabhimaan Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, SMFBSP: { name: "Swabhimaan Laghubitta Bittiya Sanstha LTD Promoter share", sector: "Promoter Share", internalSector: "Promoter Share" }, SLBBL: { name: "Swarojgar Laghubitta Bittiya Sanstha Ltd.", sector: "Microfinance", internalSector: "Microfinance Index" }, SLBBLP: { name: "Swarojgar Laghubitta Bittiya Sanstha Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, SWASTIK: { name: "Swastik Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, SGHC: { name: "Swet-Ganga Hydropower & Construction Limited ", sector: "Hydro Power", internalSector: "HydroPower Index" }, SYPNL: { name: "SY Panel Nepal Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, SPDL: { name: "Synergy Power Development Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, TRH: { name: "Taragaon Regency Hotel Limited", sector: "Hotels And Tourism", internalSector: "Hotels And Tourism" }, TPC: { name: "Terhathum Power Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, TSHL: { name: "Three Star Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, TTL: { name: "Trade Tower Limited", sector: "Others", internalSector: "Others Index" }, TVCL: { name: "Trishuli Jal Vidhyut Company Limited ", sector: "Hydro Power", internalSector: "HydroPower Index" }, UNL: { name: "Unilever Nepal Limited", sector: "Manufacturing And Processing", internalSector: "Manufacturing And Pr." }, UNHPL: { name: "Union Hydropower Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, UNLBP: { name: "Unique Nepal Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, UNLB: { name: "Unique Nepal Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, UAILPO: { name: "United Ajod Insurance Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, UAIL: { name: "United Ajod Insurance Limited", sector: "Non Life Insurance", internalSector: "Non Life Insurance" }, UMRH: { name: "United IDI Mardi RB Hydropower Limited.", sector: "Hydro Power", internalSector: "HydroPower Index" }, UMHL: { name: "United Modi Hydropower Ltd.", sector: "Hydro Power", internalSector: "HydroPower Index" }, UPCL: { name: "UNIVERSAL POWER COMPANY LTD", sector: "Hydro Power", internalSector: "HydroPower Index" }, USLB: { name: "Unnati Sahakarya Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, USLBP: { name: "Unnati Sahakarya Laghubitta Bittiya Sanstha Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, ULBSL: { name: "Upakar Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, ULBSLPO: { name: "Upakar Laghubitta Bittiya Sanstha Limited Promoter", sector: "Promoter Share", internalSector: "Promoter Share" }, UHEWA: { name: "Upper Hewakhola Hydropower Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, ULHC: { name: "Upper Lohore Khola Hydropower Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, USHEC: { name: "Upper Solu Hydro Electric Company Limited", sector: "Hydro Power", internalSector: "HydroPower Index" }, UPPER: { name: "Upper Tamakoshi Hydropower Ltd", sector: "Hydro Power", internalSector: "HydroPower Index" }, VLBS: { name: "Vijaya laghubitta Bittiya Sanstha Ltd.", sector: "Microfinance", internalSector: "Microfinance Index" }, VLBSPO: { name: "Vijaya laghubitta Bittiya Sanstha Ltd. Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" }, VLUCL: { name: "Vision Lumbini Urja Company Limited ", sector: "Hydro Power", internalSector: "HydroPower Index" }, WNLB: { name: "Wean Nepal Laghubitta Bittiya Sanstha Limited", sector: "Microfinance", internalSector: "Microfinance Index" }, WNLBP: { name: "Wean Nepal Laghubitta Bittiya Sanstha Limited Promoter Share", sector: "Promoter Share", internalSector: "Promoter Share" } };

// src/utils/liveData.js
var getProxyBase = () => {
  const envUrl = import.meta.env.VITE_PROXY_URL;
  return envUrl && envUrl.trim() ? envUrl.trim().replace(/\/$/, "") : "http://localhost:5000";
};
var CORS_PROXY = "https://api.allorigins.win/raw?url=";
var parseMoney = (str) => {
  if (!str) return NaN;
  return parseFloat(str.replace(/,/g, "").trim());
};
var fetchLiveTradingDirect = async () => {
  const isNative = Capacitor.isNativePlatform();
  const rawUrl = "https://www.sharesansar.com/live-trading";
  const targetUrl = isNative ? rawUrl : `${CORS_PROXY}${encodeURIComponent(rawUrl)}`;
  const res = await fetch(targetUrl, { signal: AbortSignal.timeout(14e3) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const stocks = [];
  doc.querySelectorAll("table tbody tr").forEach((row) => {
    const tds = row.querySelectorAll("td");
    if (tds.length >= 10) {
      const symbol = tds[1]?.textContent.trim();
      const ltp = parseMoney(tds[2]?.textContent);
      const pChange = parseMoney(tds[4]?.textContent);
      const open = parseMoney(tds[5]?.textContent);
      const high = parseMoney(tds[6]?.textContent);
      const low = parseMoney(tds[7]?.textContent);
      const volume = parseMoney(tds[8]?.textContent);
      const turn = parseMoney(tds[9]?.textContent);
      if (symbol && !isNaN(ltp)) {
        stocks.push({ symbol, name: symbol, ltp, change: 0, pChange, open, high, low, volume, turnover: turn, sector: "Unknown", source: "live" });
      }
    }
  });
  return stocks;
};
var fetchTodayPricesDirect = async () => {
  const isNative = Capacitor.isNativePlatform();
  const rawUrl = "https://www.sharesansar.com/today-share-price";
  const targetUrl = isNative ? rawUrl : `${CORS_PROXY}${encodeURIComponent(rawUrl)}`;
  const res = await fetch(targetUrl, { signal: AbortSignal.timeout(16e3) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const stocks = [];
  doc.querySelectorAll("table tbody tr").forEach((row) => {
    const tds = row.querySelectorAll("td");
    if (tds.length >= 7) {
      const symbol = tds[1]?.textContent.trim();
      const ltp = parseMoney(tds[6]?.textContent);
      const open = parseMoney(tds[3]?.textContent);
      const high = parseMoney(tds[4]?.textContent);
      const low = parseMoney(tds[5]?.textContent);
      const volume = parseMoney(tds[8]?.textContent);
      const pChange = parseMoney(tds[7]?.textContent);
      if (symbol && !isNaN(ltp)) {
        stocks.push({ symbol, name: symbol, ltp, change: 0, pChange, open, high, low, volume, turnover: 0, sector: "Unknown", source: "today" });
      }
    }
  });
  return stocks;
};
var fetchLiveMarketData = async () => {
  try {
    const stocks = await fetchLiveTradingDirect();
    console.log(`[NEPSE] \u{1F310} Direct live data loaded \u2014 ${stocks.length} stocks`);
    return { data: stocks, source: "live" };
  } catch (e) {
    console.warn("[NEPSE] Layer 0 live failed:", e.message);
  }
  try {
    const stocks = await fetchTodayPricesDirect();
    console.log(`[NEPSE] \u{1F310} Direct closing data loaded \u2014 ${stocks.length} stocks`);
    return { data: stocks, source: "closing" };
  } catch (e) {
    console.warn("[NEPSE] Layer 0 closing failed:", e.message);
  }
  const base = getProxyBase();
  try {
    const res = await fetch(`${base}/api/market-summary`, { headers: { "Bypass-Tunnel-Reminder": "true" }, signal: AbortSignal.timeout(8e3) });
    const json = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      console.log(`[NEPSE] \u2705 Proxy live data loaded \u2014 ${json.data.length} stocks`);
      return { data: json.data, source: "live" };
    }
  } catch (_) {
  }
  try {
    const res = await fetch(`${base}/api/today-prices`, { headers: { "Bypass-Tunnel-Reminder": "true" }, signal: AbortSignal.timeout(8e3) });
    const json = await res.json();
    if (json.success && json.data && json.data.length > 0) {
      console.log(`[NEPSE] \u{1F4C5} Proxy closing data loaded \u2014 ${json.data.length} stocks`);
      return { data: json.data, source: "closing" };
    }
  } catch (_) {
  }
  console.warn("[NEPSE] \u26A0\uFE0F  No live or closing data available. Using simulated data.");
  return null;
};
var fetchMarketStatus = async () => {
  const base = getProxyBase();
  try {
    const res = await fetch(`${base}/api/status`, { headers: { "Bypass-Tunnel-Reminder": "true" }, signal: AbortSignal.timeout(5e3) });
    const json = await res.json();
    return json;
  } catch (_) {
    const now = /* @__PURE__ */ new Date();
    let nptDay, nptMins;
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kathmandu",
        hour12: false,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric"
      });
      const parts = formatter.formatToParts(now);
      const val = (type) => parseInt(parts.find((p) => p.type === type).value, 10);
      const year = val("year");
      const month = val("month") - 1;
      const day = val("day");
      const hour = val("hour") % 24;
      const minute = val("minute");
      const nptDate = new Date(year, month, day, hour, minute);
      nptDay = nptDate.getDay();
      nptMins = hour * 60 + minute;
    } catch (e) {
      const nptOffset = 5 * 60 + 45;
      const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
      nptMins = (utcMins + nptOffset) % (24 * 60);
      nptDay = (now.getUTCDay() + Math.floor((utcMins + nptOffset) / (24 * 60))) % 7;
    }
    const isWeekday = nptDay >= 0 && nptDay <= 4;
    const isOpen = isWeekday && nptMins >= 11 * 60 && nptMins < 15 * 60;
    const hh = String(Math.floor(nptMins / 60)).padStart(2, "0");
    const mm = String(nptMins % 60).padStart(2, "0");
    return { isOpen, nptTime: `${hh}:${mm}`, message: isOpen ? "Market is OPEN" : "Market is CLOSED" };
  }
};
var fetchMarketIndices = async () => {
  try {
    const isNative = Capacitor.isNativePlatform();
    const rawUrl = "https://www.sharesansar.com/market";
    const targetUrl = isNative ? rawUrl : `${CORS_PROXY}${encodeURIComponent(rawUrl)}`;
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(12e3) });
    if (res.ok) {
      const html = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const indices = {};
      doc.querySelectorAll("table tbody tr").forEach((row) => {
        const tds = row.querySelectorAll("td");
        if (tds.length >= 7) {
          const name = tds[0]?.textContent.trim().toUpperCase();
          const value = parseMoney(tds[4]?.textContent);
          const change = parseMoney(tds[5]?.textContent);
          const pChange = parseMoney(tds[6]?.textContent);
          if (!isNaN(value)) {
            if (name === "NEPSE INDEX") indices.nepse = { value, change, pChange };
            if (name === "FLOAT INDEX") indices.float = { value, change, pChange };
            if (name === "SENSITIVE INDEX") indices.sensitive = { value, change, pChange };
          }
        }
      });
      if (Object.keys(indices).length > 0) return indices;
    }
  } catch (_) {
  }
  const base = getProxyBase();
  try {
    const res = await fetch(`${base}/api/market-indices`, { signal: AbortSignal.timeout(8e3) });
    const json = await res.json();
    if (json.success && json.data) return json.data;
  } catch (_) {
  }
  return null;
};
var mergeWithMockData = (scrapedStocks, mockStocks) => {
  const mockMap = {};
  mockStocks.forEach((mock) => {
    mockMap[mock.symbol] = mock;
  });
  const merged = scrapedStocks.map((scraped) => {
    const mock = mockMap[scraped.symbol];
    if (mock) {
      mock.processed = true;
      const ltp = scraped.ltp;
      const change = scraped.change;
      const pChange = scraped.pChange;
      const pe = mock.eps > 0 ? Number((ltp / mock.eps).toFixed(2)) : 0;
      const pb = mock.bookValue > 0 ? Number((ltp / mock.bookValue).toFixed(2)) : 0;
      const marketCap = Number((ltp * mock.listedShares).toFixed(2));
      return {
        ...mock,
        ltp,
        change,
        pChange,
        open: scraped.open || ltp,
        high: scraped.high || ltp,
        low: scraped.low || ltp,
        prevClose: scraped.prevClose || mock.basePrice,
        volume: scraped.volume || mock.volume,
        turnover: scraped.turnover || 0,
        rsi: scraped.rsi || mock.rsi,
        macd: scraped.macd || mock.macd,
        pe,
        pb,
        marketCap,
        high52w: Math.max(mock.high52w, ltp),
        low52w: Math.min(mock.low52w, ltp),
        source: scraped.source || "merged"
      };
    } else {
      return {
        ...scraped,
        name: stockmap_default[scraped.symbol]?.name || scraped.symbol,
        eps: 0,
        pe: 0,
        bookValue: 0,
        pb: 0,
        sector: stockmap_default[scraped.symbol]?.sector || "Others",
        listedShares: 1e6,
        marketCap: Number((scraped.ltp * 1e6).toFixed(2)),
        high52w: scraped.high || scraped.ltp,
        low52w: scraped.low || scraped.ltp,
        source: scraped.source || "live"
      };
    }
  });
  mockStocks.forEach((mock) => {
    if (!mock.processed) {
      merged.push(mock);
    } else {
      delete mock.processed;
    }
  });
  return merged;
};
var calculateIndices2 = (stocks) => {
  if (!stocks || stocks.length === 0) {
    return {
      nepse: { value: 2e3, change: 0, pChange: 0 },
      float: { value: 120, change: 0, pChange: 0 },
      sensitive: { value: 380, change: 0, pChange: 0 }
    };
  }
  let totalCap = 0, baseCap = 0;
  stocks.forEach((s) => {
    totalCap += (s.ltp || s.basePrice) * (s.listedShares || 1);
    baseCap += (s.basePrice || s.ltp) * (s.listedShares || 1);
  });
  const ratio = baseCap > 0 ? totalCap / baseCap : 1;
  const nepse = Number((2e3 * ratio).toFixed(2));
  const floatIdx = Number((120 * ratio).toFixed(2));
  const sensitive = Number((380 * ratio).toFixed(2));
  return {
    nepse: { value: nepse, change: Number((nepse - 2e3).toFixed(2)), pChange: Number(((nepse - 2e3) / 2e3 * 100).toFixed(2)) },
    float: { value: floatIdx, change: Number((floatIdx - 120).toFixed(2)), pChange: Number(((floatIdx - 120) / 120 * 100).toFixed(2)) },
    sensitive: { value: sensitive, change: Number((sensitive - 380).toFixed(2)), pChange: Number(((sensitive - 380) / 380 * 100).toFixed(2)) }
  };
};
var fetchStockFundamentals = async (symbol) => {
  try {
    const isNative = Capacitor.isNativePlatform();
    const rawUrl = `https://www.sharesansar.com/company/${symbol.toLowerCase()}`;
    const targetUrl = isNative ? rawUrl : `${CORS_PROXY}${encodeURIComponent(rawUrl)}`;
    const res = await fetch(targetUrl, { signal: AbortSignal.timeout(12e3) });
    if (!res.ok) return null;
    const html = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const detail = {
      eps: 0,
      pe: 0,
      bookValue: 0,
      pbv: 0,
      dividend: 0,
      bonus: 0,
      marketCap: 0,
      sharesOutstanding: 0,
      listedShares: 0,
      paidUpCapital: 0,
      high52w: 0,
      low52w: 0,
      sector: "Unknown"
    };
    doc.querySelectorAll("table tr").forEach((tr) => {
      const tds = tr.querySelectorAll("td, th");
      if (tds.length >= 2) {
        const label = tds[0].textContent.trim().toLowerCase();
        const valueStr = tds[1].textContent.trim();
        const val = parseMoney(valueStr);
        if (label.includes("sector")) detail.sector = valueStr;
        if (label.includes("shares outstanding") || label.includes("outstanding shares")) detail.sharesOutstanding = val;
        if (label.includes("market price") || label === "ltp" || label.includes("last traded")) detail.marketPrice = val;
        if (label.includes("52") && label.includes("high")) {
          const parts = valueStr.split(/[-/]/);
          detail.high52w = parseMoney(parts[0]);
          if (parts.length > 1) detail.low52w = parseMoney(parts[1]);
        }
        if (label.includes("eps") || label.includes("earning per share")) detail.eps = val;
        if (label.includes("p/e") || label.includes("pe ratio") || label.includes("price earning")) detail.pe = val;
        if (label.includes("book value")) detail.bookValue = val;
        if (label === "pbv" || label.includes("p/b") || label.includes("price to book")) detail.pbv = val;
        if (label.includes("% dividend") || label.includes("dividend") && label.includes("%")) detail.dividend = parseMoney(valueStr.replace("%", ""));
        if (label.includes("% bonus") || label.includes("bonus") && label.includes("%")) detail.bonus = parseMoney(valueStr.replace("%", ""));
        if (label.includes("market cap")) detail.marketCap = val;
        if (label.includes("company name") || label.includes("name of company")) detail.companyName = valueStr;
        if (label.includes("listed shares") || label.includes("total shares")) detail.listedShares = val;
        if (label.includes("paid") && label.includes("capital")) detail.paidUpCapital = val;
      }
    });
    return detail;
  } catch (err) {
    console.error("Failed to fetch stock fundamentals directly:", err);
  }
  return null;
};
var fetchPriceHistory = async (symbol) => {
  try {
    const isNative = Capacitor.isNativePlatform();
    const rawUrl = `https://www.sharesansar.com/company/${symbol.toLowerCase()}`;
    const targetUrl = isNative ? rawUrl : `${CORS_PROXY}${encodeURIComponent(rawUrl)}`;
    const pageRes = await fetch(targetUrl, { signal: AbortSignal.timeout(12e3) });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    let token = doc.querySelector('meta[name="_token"]')?.getAttribute("content") || doc.querySelector('input[name="_token"]')?.value;
    let companyId = doc.querySelector("#companyid")?.textContent.trim();
    if (!token || !companyId) return null;
    const postData = new URLSearchParams();
    postData.append("company", companyId);
    postData.append("draw", "1");
    postData.append("start", "0");
    postData.append("length", "30");
    const historyUrl = isNative ? "https://www.sharesansar.com/company-price-history" : `${CORS_PROXY}${encodeURIComponent("https://www.sharesansar.com/company-price-history")}`;
    const historyRes = await fetch(historyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-CSRF-Token": token,
        "X-Requested-With": "XMLHttpRequest",
        "Referer": rawUrl
      },
      body: postData.toString()
    });
    if (historyRes.ok) {
      const json = await historyRes.json();
      if (json.data && Array.isArray(json.data)) {
        const formatted = json.data.map((item) => ({
          date: item.published_date,
          open: parseFloat(item.open),
          high: parseFloat(item.high),
          low: parseFloat(item.low),
          close: parseFloat(item.close),
          volume: parseFloat(item.traded_quantity)
        }));
        formatted.reverse();
        return formatted;
      }
    }
  } catch (err) {
    console.error("Failed to fetch price history natively:", err);
  }
  return null;
};
export {
  calculateIndices2 as calculateIndices,
  fetchLiveMarketData,
  fetchMarketIndices,
  fetchMarketStatus,
  fetchPriceHistory,
  fetchStockFundamentals,
  getProxyBase,
  mergeWithMockData
};
