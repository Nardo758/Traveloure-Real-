/**
 * Test Account Registry for Traveloure E2E Testing
 * All accounts use password: TestPass123!
 */

const PASSWORD = 'TestPass123!';

export interface TestAccount {
  email: string;
  password: string;
  role: 'expert' | 'provider' | 'traveler' | 'ea' | 'admin';
  market: string;
  name: string;
  specialty?: string;
}

export const testAccounts = {
  // ======================
  // 5 ORIGINAL TEST ACCOUNTS
  // ======================
  original: [
    {
      email: 'test-travel-expert@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'global',
      name: 'Travel Expert',
    },
    {
      email: 'test-local-expert@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'global',
      name: 'Local Expert',
    },
    {
      email: 'test-event-planner@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'global',
      name: 'Event Planner',
    },
    {
      email: 'test-provider@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'global',
      name: 'Service Provider',
    },
    {
      email: 'test-ea@traveloure.test',
      password: PASSWORD,
      role: 'ea',
      market: 'global',
      name: 'Executive Assistant',
    },
  ] as TestAccount[],

  // ======================
  // KYOTO MARKET (8 ACCOUNTS)
  // ======================
  kyoto: [
    // Local Experts
    {
      email: 'kyoto-temple@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'kyoto',
      name: 'Yuki Tanaka',
      specialty: 'Temple Guide',
    },
    {
      email: 'kyoto-arts@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'kyoto',
      name: 'Haruki Sato',
      specialty: 'Traditional Arts',
    },
    {
      email: 'kyoto-food@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'kyoto',
      name: 'Aiko Yamamoto',
      specialty: 'Food & Culinary',
    },
    {
      email: 'kyoto-neighborhood@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'kyoto',
      name: 'Kenji Nakamura',
      specialty: 'Neighborhood',
    },
    {
      email: 'kyoto-etiquette@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'kyoto',
      name: 'Mei Kobayashi',
      specialty: 'Etiquette',
    },
    // Service Providers
    {
      email: 'kyoto-transport@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'kyoto',
      name: 'Takeshi Ito',
      specialty: 'Transport',
    },
    {
      email: 'kyoto-photography@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'kyoto',
      name: 'Sakura Watanabe',
      specialty: 'Photography',
    },
    {
      email: 'kyoto-stays@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'kyoto',
      name: 'Ryo Suzuki',
      specialty: 'Stays',
    },
  ] as TestAccount[],

  // ======================
  // EDINBURGH MARKET (7 ACCOUNTS)
  // ======================
  edinburgh: [
    // Local Experts
    {
      email: 'edinburgh-culture@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'edinburgh',
      name: 'Alistair MacGregor',
      specialty: 'Culture & History',
    },
    {
      email: 'edinburgh-whisky@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'edinburgh',
      name: 'Fiona Campbell',
      specialty: 'Whisky',
    },
    {
      email: 'edinburgh-festival@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'edinburgh',
      name: 'Hamish Stewart',
      specialty: 'Festival',
    },
    {
      email: 'edinburgh-highlands@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'edinburgh',
      name: 'Morag Fraser',
      specialty: 'Highlands',
    },
    // Service Providers
    {
      email: 'edinburgh-transport@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'edinburgh',
      name: 'Angus MacDonald',
      specialty: 'Transport',
    },
    {
      email: 'edinburgh-photography@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'edinburgh',
      name: 'Isla Robertson',
      specialty: 'Photography',
    },
    {
      email: 'edinburgh-stays@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'edinburgh',
      name: 'Duncan Murray',
      specialty: 'Stays',
    },
  ] as TestAccount[],

  // ======================
  // CARTAGENA MARKET (9 ACCOUNTS)
  // ======================
  cartagena: [
    // Local Experts
    {
      email: 'cartagena-romance@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'cartagena',
      name: 'Valentina Herrera',
      specialty: 'Romance & Luxury',
    },
    {
      email: 'cartagena-culture@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'cartagena',
      name: 'Miguel Castillo',
      specialty: 'Culture & History',
    },
    {
      email: 'cartagena-food@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'cartagena',
      name: 'Sofia Vargas',
      specialty: 'Food & Culinary',
    },
    {
      email: 'cartagena-beach@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'cartagena',
      name: 'Diego Morales',
      specialty: 'Beach & Island',
    },
    // Service Providers
    {
      email: 'cartagena-transport@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'cartagena',
      name: 'Andres Reyes',
      specialty: 'Transport',
    },
    {
      email: 'cartagena-photography@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'cartagena',
      name: 'Camila Torres',
      specialty: 'Photography',
    },
    {
      email: 'cartagena-stays@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'cartagena',
      name: 'Juan Ospina',
      specialty: 'Stays',
    },
    {
      email: 'cartagena-luxury@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'cartagena',
      name: 'Isabella Mendoza',
      specialty: 'Luxury Services',
    },
    {
      email: 'cartagena-concierge@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'cartagena',
      name: 'Carlos Rivera',
      specialty: 'Concierge',
    },
  ] as TestAccount[],

  // ======================
  // JAIPUR MARKET (8 ACCOUNTS)
  // ======================
  jaipur: [
    // Local Experts
    {
      email: 'jaipur-artisan@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'jaipur',
      name: 'Priya Sharma',
      specialty: 'Artisan & Craft',
    },
    {
      email: 'jaipur-culture@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'jaipur',
      name: 'Arjun Singh',
      specialty: 'Culture & History',
    },
    {
      email: 'jaipur-food@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'jaipur',
      name: 'Deepa Gupta',
      specialty: 'Food & Culinary',
    },
    {
      email: 'jaipur-photography-expert@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'jaipur',
      name: 'Vikram Rathore',
      specialty: 'Photography',
    },
    // Service Providers
    {
      email: 'jaipur-transport@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'jaipur',
      name: 'Ravi Kumar',
      specialty: 'Transport',
    },
    {
      email: 'jaipur-photography@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'jaipur',
      name: 'Ananya Mehra',
      specialty: 'Photography',
    },
    {
      email: 'jaipur-stays@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'jaipur',
      name: 'Manish Joshi',
      specialty: 'Stays',
    },
    {
      email: 'jaipur-shopping@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'jaipur',
      name: 'Neha Agarwal',
      specialty: 'Shopping',
    },
  ] as TestAccount[],

  // ======================
  // PORTO MARKET (8 ACCOUNTS)
  // ======================
  porto: [
    // Local Experts
    {
      email: 'porto-wine@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'porto',
      name: 'Joao Ferreira',
      specialty: 'Wine',
    },
    {
      email: 'porto-architecture@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'porto',
      name: 'Ana Silva',
      specialty: 'Architecture',
    },
    {
      email: 'porto-food@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'porto',
      name: 'Pedro Costa',
      specialty: 'Food & Culinary',
    },
    {
      email: 'porto-digitalnomad@traveloure.test',
      password: PASSWORD,
      role: 'expert',
      market: 'porto',
      name: 'Mariana Santos',
      specialty: 'Digital Nomad',
    },
    // Service Providers
    {
      email: 'porto-transport@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'porto',
      name: 'Tiago Oliveira',
      specialty: 'Transport',
    },
    {
      email: 'porto-photography@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'porto',
      name: 'Ines Pereira',
      specialty: 'Photography',
    },
    {
      email: 'porto-stays@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'porto',
      name: 'Miguel Almeida',
      specialty: 'Stays',
    },
    {
      email: 'porto-winery@traveloure.test',
      password: PASSWORD,
      role: 'provider',
      market: 'porto',
      name: 'Helena Rodrigues',
      specialty: 'Winery Tours',
    },
  ] as TestAccount[],

  // ======================
  // 5 TEST TRAVELER ACCOUNTS
  // ======================
  travelers: [
    {
      email: 'test-traveler-kyoto@traveloure.test',
      password: PASSWORD,
      role: 'traveler',
      market: 'kyoto',
      name: 'Kyoto Traveler',
    },
    {
      email: 'test-traveler-edinburgh@traveloure.test',
      password: PASSWORD,
      role: 'traveler',
      market: 'edinburgh',
      name: 'Edinburgh Traveler',
    },
    {
      email: 'test-traveler-cartagena@traveloure.test',
      password: PASSWORD,
      role: 'traveler',
      market: 'cartagena',
      name: 'Cartagena Traveler',
    },
    {
      email: 'test-traveler-jaipur@traveloure.test',
      password: PASSWORD,
      role: 'traveler',
      market: 'jaipur',
      name: 'Jaipur Traveler',
    },
    {
      email: 'test-traveler-porto@traveloure.test',
      password: PASSWORD,
      role: 'traveler',
      market: 'porto',
      name: 'Porto Traveler',
    },
  ] as TestAccount[],
};

/**
 * Get all test accounts flattened into a single array
 */
export function getAllTestAccounts(): TestAccount[] {
  return [
    ...testAccounts.original,
    ...testAccounts.kyoto,
    ...testAccounts.edinburgh,
    ...testAccounts.cartagena,
    ...testAccounts.jaipur,
    ...testAccounts.porto,
    ...testAccounts.travelers,
  ];
}

/**
 * Get accounts by market
 */
export function getAccountsByMarket(market: string): TestAccount[] {
  return getAllTestAccounts().filter((account) => account.market === market);
}

/**
 * Get accounts by role
 */
export function getAccountsByRole(role: TestAccount['role']): TestAccount[] {
  return getAllTestAccounts().filter((account) => account.role === role);
}

/**
 * Get a specific account by email
 */
export function getAccountByEmail(email: string): TestAccount | undefined {
  return getAllTestAccounts().find((account) => account.email === email);
}

/**
 * Total test account count
 */
export function getTotalAccountCount(): number {
  return getAllTestAccounts().length;
}
