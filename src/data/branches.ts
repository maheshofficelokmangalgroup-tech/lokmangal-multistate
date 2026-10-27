// Branch network, as listed on the society's Branches page. Edit here to add or update a branch.

export type Branch = { name: string; address: string; phones: string[] };
export type Division = { name: string; branches: Branch[] };

export const headOffice = {
  name: 'Head Office — Shelgi, Solapur',
  address: 'Plot No. 94, Mitra Nagar, Near Rabbi Research Center, Shelgi, Solapur – 413002',
  phones: ['+91 99232 03322'],
};

export const divisions: Division[] = [
  {
    "name": "Pune Region",
    "branches": [
      {
        "name": "Mandai",
        "address": "Kubera Chambers, 1st Floor, In Front of Sancheti Hospital, Near Meet Con, Shivaji Nagar Pune 411005",
        "phones": [
          "+91 99232 09425"
        ]
      },
      {
        "name": "Bhor",
        "address": "Vetal Peth, Bhor Tal, Bhor, Dist. Pune, Pin code – 412206",
        "phones": [
          "+91 75079 99474"
        ]
      },
      {
        "name": "Sangavi",
        "address": "Nisarg Nivas, opp. Famous katta Cafe, Famous Chowk, New Sangavi, Pune",
        "phones": [
          "+91 99232 09415"
        ]
      },
      {
        "name": "Talegaon Dabhade",
        "address": "Plot no. 2, Shop no. 3, vaidya Colony, Shri Swami Samarth Complex",
        "phones": [
          "+91 75079 99475"
        ]
      }
    ]
  },
  {
    "name": "Andur Division",
    "branches": [
      {
        "name": "Itkal",
        "address": "Ganesh Nagar S.T.Stand Itkal Tal.Tuljapur Dist Osmanabad",
        "phones": [
          "+91 99231 28047"
        ]
      },
      {
        "name": "Katgaon",
        "address": "AT Post Katgaon Tal.Osmanabad Fular Wadi Betkar Nivas 413603",
        "phones": [
          "+91 98347 38795"
        ]
      },
      {
        "name": "Andur",
        "address": "Near Grampanchayat Office, Andur",
        "phones": [
          "+91 99236 59445"
        ]
      },
      {
        "name": "Jalkot",
        "address": "Neni Complex, Near Petrol pump, National Highway no. 65, Jalkot, Tal. – Tuljapur, Dist.- Dharashiv",
        "phones": [
          "+91 99705 25687"
        ]
      },
      {
        "name": "Naldurg",
        "address": "Hotel Shivraj near gramin bank Tal.Tuljapur Dist Osmanabad",
        "phones": [
          "+91 99236 59449"
        ]
      },
      {
        "name": "Tamalwadi",
        "address": "Police Station Backside, Tal. Tuljapur, Dist. Osmanabad",
        "phones": [
          "+91 77220 46522"
        ]
      }
    ]
  },
  {
    "name": "Shelgaon Division",
    "branches": [
      {
        "name": "Junction",
        "address": "At-Junction (Sainagar), Po-lasurne, Tal-Indapur, Dist-Pune",
        "phones": [
          "+91 99236 59451"
        ]
      },
      {
        "name": "Shelgaon",
        "address": "A/p-Shelgaon Tal Indapur Dist-Pune",
        "phones": [
          "+91 99238 00403"
        ]
      },
      {
        "name": "Indapur",
        "address": "Nagar Palika Road Juni Baramati Sah. Bank Indapur Dist., Pune",
        "phones": [
          "+91 99232 09448"
        ]
      },
      {
        "name": "Loni",
        "address": "Rajmata Chowk, Near Highway Breeze Loni Deokar Tal – Indapur Dist – Pune 413132",
        "phones": [
          "+91 90227 76191",
          "+91 97668 66119"
        ]
      }
    ]
  },
  {
    "name": "Paranda Division",
    "branches": [
      {
        "name": "Bhoom",
        "address": "Paul Nivas, Vetala Road, Bhoom",
        "phones": [
          "+91 99236 59455"
        ]
      },
      {
        "name": "Washi",
        "address": "Laxmi Road Shinde Complex, Near DCC Bank, Washi, Tq. washi, Dist. dharashive",
        "phones": [
          "+91 93598 53036"
        ]
      },
      {
        "name": "Mankeshwar",
        "address": "At Post Mankeshwar, Tal Bhoom, Dist Dharashiv 413504",
        "phones": [
          "+91 77740 74789"
        ]
      },
      {
        "name": "Jawala Ni",
        "address": "At Post Jawala Ni Tal. Paranda Dist. Osmanabad",
        "phones": [
          "+91 93591 45857"
        ]
      },
      {
        "name": "Paranda",
        "address": "Shivaji Chowk, Police station Samor Sadekar Complex, At. Post. Paranda, Dist. Dharashiv",
        "phones": [
          "+91 99236 59440"
        ]
      },
      {
        "name": "Anala",
        "address": "At Post Anala Shivaji Chowk Bajar Road Tal Paranda Dist osmanabad",
        "phones": [
          "+91 75079 99463"
        ]
      },
      {
        "name": "Walwad",
        "address": "At Post Patrud Rod Walwad Tal. Bhoom Dist. Dharashiv",
        "phones": [
          "+91 77740 74796"
        ]
      }
    ]
  },
  {
    "name": "Dhoki Division",
    "branches": [
      {
        "name": "Kalamb",
        "address": "At Post Kalamb, Tq – Kalamb, Dist – Dharashiv",
        "phones": [
          "+91 94046 76030"
        ]
      },
      {
        "name": "Murud",
        "address": "Janata Vidyalaya Shopping Complex, S.T. Stand, Murud, Dist. Latur",
        "phones": [
          "+91 99232 09417"
        ]
      },
      {
        "name": "Bembali",
        "address": "Bajar Chowk Bembali Tal., Osmanabad Dist., Osmanabad",
        "phones": [
          "+91 95615 52472"
        ]
      },
      {
        "name": "Dhoki",
        "address": "At Post Dhoki, Near SBI Bank, Rajesh Nagar Dhoki Tq & Dist Dharshiv",
        "phones": [
          "+91 77740 74793",
          "+91 98340 80305"
        ]
      },
      {
        "name": "Jagji",
        "address": "At Post Jagji Tal, Dist. Osmanabad",
        "phones": [
          "+91 70664 43090"
        ]
      },
      {
        "name": "Kond",
        "address": "At Post Kond Tal Dist Osmanabad",
        "phones": [
          "+91 74994 25193"
        ]
      },
      {
        "name": "Wagholi",
        "address": "At Post Wagholi Gandhi Chowk Tal Osmanabad Dist osmanabad",
        "phones": [
          "+91 82083 19986"
        ]
      },
      {
        "name": "Keshegaon",
        "address": "Keshegaon, Ta & Dist Dharashiv",
        "phones": [
          "+91 92840 45791"
        ]
      },
      {
        "name": "Ujani",
        "address": "UJANI. Kamalpur Road, Ujani Mod, Ta. Ausa Dist. Latur",
        "phones": [
          "+91 77740 74794"
        ]
      }
    ]
  },
  {
    "name": "Kolhapur Division",
    "branches": [
      {
        "name": "Kolhapur",
        "address": "Shri Gajanan Building, 1210 A Ward, Ardha Shivaji Putla, In front of Daulatrao Bhosale High School, Shivaji Peth, Kolhapur – 416012",
        "phones": [
          "+91 99238 00170"
        ]
      },
      {
        "name": "Ratnagiri",
        "address": "gala no. 19, Paras Plaza, K. J. Jain Nagar, Ratnagiri 415612",
        "phones": [
          "+91 85520 00130"
        ]
      },
      {
        "name": "Murgud",
        "address": "Sir Piraji Road near Bank Of India Tal.kagal Murgud",
        "phones": [
          "+91 85520 00130"
        ]
      },
      {
        "name": "Bhogawati",
        "address": "At Post Shahu nagar Parite (Bhogavati) Sugar Factory, Dist. Kolhapur",
        "phones": [
          "+91 82088 59496"
        ]
      },
      {
        "name": "Jaysingpur",
        "address": "9th Galli, Netaji Chowk, Near Ratnakar Bank, Jaysingpur, Tal. Shirol, Dist. Kolhapur",
        "phones": [
          "+91 75079 99431"
        ]
      },
      {
        "name": "Ashta",
        "address": "Sathe Complex Near State Bank, Astha Tal, Valva Dist, Sangli",
        "phones": [
          "+91 85520 00131"
        ]
      }
    ]
  },
  {
    "name": "Belgaon Region",
    "branches": [
      {
        "name": "Belgaum",
        "address": "CTS No. 1834/1/2, Maiti Corner, 2nd Floor, Kadolkar Galli, Bapat Galli Corner, Belgaum-590001",
        "phones": [
          "+91 91759 24531"
        ]
      },
      {
        "name": "Nipani",
        "address": "Lad Complex, Old P.B. Road, Sakharwadi, Nipani – 591237",
        "phones": [
          "+91 91759 32539"
        ]
      },
      {
        "name": "Gadhinglaj",
        "address": "Nehru Chowk State Bank, Tal. Gadhinglaj, Dist. Kolhapur 416502",
        "phones": [
          "+91 91750 97213"
        ]
      }
    ]
  },
  {
    "name": "Omerga Division",
    "branches": [
      {
        "name": "Omerga",
        "address": "Mane Complex Main Road, Omerga",
        "phones": [
          "+91 70660 47594"
        ]
      },
      {
        "name": "Lohara",
        "address": "Shivaji Chowk Jatte Complex Gala No. 4, 5 tal Lohara Dist., Osmanabad",
        "phones": [
          "+91 77740 44508"
        ]
      },
      {
        "name": "Narangwadi",
        "address": "At Post Narangwadi Pawar Complex Tal Omarga Dist Osmanabad",
        "phones": [
          "+91 77200 66225"
        ]
      },
      {
        "name": "Kasar Shirshi",
        "address": "Murtuja Complex, Nilanga Road, Kasar shirshi, Nilanga, Latur",
        "phones": [
          "+91 77740 44506"
        ]
      },
      {
        "name": "Turori",
        "address": "Near Hanuman Temple, Main Road, Turori",
        "phones": [
          "+91 77740 44505"
        ]
      },
      {
        "name": "Makni",
        "address": "Latur rode the Maharashtra Gramin Bank near Makani 413608 Makani, Maharashtra",
        "phones": [
          "+91 77740 44507"
        ]
      },
      {
        "name": "Jevali",
        "address": "At Post Jevali Bajar Road Main Road, Tal. Lohara, Dist. Osmanabad",
        "phones": [
          "+91 99238 00296"
        ]
      },
      {
        "name": "Murum",
        "address": "Basweshwar Chowk, Bank of Maharashtra ATM neyar Murum",
        "phones": [
          "+91 77200 96478"
        ]
      }
    ]
  },
  {
    "name": "Tuljapur Division",
    "branches": [
      {
        "name": "Tuljapur",
        "address": "In Front of Old Bus Stand, Near ICICI Bank, Hangargekar Complex,Tuljapur",
        "phones": [
          "+91 77200 96479"
        ]
      },
      {
        "name": "Osmanabad",
        "address": "Tirthkar Complex Police Nivas Yedshi Road Tal. Osmanabad Dist. Osmanabad",
        "phones": [
          "+91 99238 00149"
        ]
      },
      {
        "name": "Kakramba",
        "address": "Tuljapur-Latur Road, Kakramba",
        "phones": [
          "+91 77740 44509"
        ]
      },
      {
        "name": "Aarli",
        "address": "At Post Arali Near Grampanchayat Tal, Tuljapur Dist, Osmanabad",
        "phones": [
          "+91 99236 59435"
        ]
      },
      {
        "name": "Mangrul",
        "address": "At Post Mangrul B.S.N.L. Office, Tal. Tuljapur, Dist. Osmanabad",
        "phones": [
          "+91 75079 99460"
        ]
      },
      {
        "name": "Kati",
        "address": "S.T. Stand At Post Kati Tal, Tuljapur Dist., Osmanabad",
        "phones": [
          "+91 91758 96782"
        ]
      },
      {
        "name": "Sawargaon",
        "address": "Near ST Stand Tuljapur Road, Sawargaon, TQ Tuljapur Dist Dharashiv",
        "phones": [
          "+91 77740 44511"
        ]
      },
      {
        "name": "Karajkheda",
        "address": "Main Road, Tal. Osmanabad Dist., Osmanabad",
        "phones": [
          "+91 98230 27332"
        ]
      },
      {
        "name": "Shelgi",
        "address": "Near Rabbi Research Center, Shelagi, Solapur 413006",
        "phones": [
          "+91 99232 03322"
        ]
      }
    ]
  },
  {
    "name": "Parbhani Division",
    "branches": [
      {
        "name": "Parbhani",
        "address": "Sanjay Baburao Gaikwad Asthbhuja Devi Ground Sonai Building Station Road, Parbhani",
        "phones": [
          "+91 85520 00133"
        ]
      },
      {
        "name": "Aundha",
        "address": "Nagnath Mandir Road Hedgevar Chowk Aunda Nagnath 431705",
        "phones": [
          "+91 75079 99436"
        ]
      },
      {
        "name": "Kalamnuri",
        "address": "Near Old Police Station Kalamnuri Dist., Hingoli 431701",
        "phones": [
          "+91 75079 99437"
        ]
      },
      {
        "name": "Mudkhed",
        "address": "Subhash Ganj Mondha Mudhkhed Dist., Nanded",
        "phones": [
          "+91 75079 99439"
        ]
      }
    ]
  },
  {
    "name": "Nilanga Region",
    "branches": [
      {
        "name": "Latur",
        "address": "Opposite Lifestyle building, near Gadade Hospital, Rajiv Gandhi Chowk, Latur 413531",
        "phones": [
          "+91 77220 39685"
        ]
      },
      {
        "name": "Nilanga",
        "address": "Maharastra Shikshan Samiti Gala No. 9 Nilanga Dist Latur",
        "phones": [
          "+91 99236 59436"
        ]
      },
      {
        "name": "Aurad Shahajani",
        "address": "Mahesh Urban Bank Side Main Road Market Yard Aurad",
        "phones": [
          "+91 85520 00141"
        ]
      },
      {
        "name": "Bhalki",
        "address": "Near Seventh-day School, Gunj Road, Bhalki",
        "phones": [
          "+91 91751 89241"
        ]
      },
      {
        "name": "Ausa",
        "address": "Hanuman chowk, main road, above maharaja collection, Ausa",
        "phones": [
          "+91 82375 15851",
          "+91 80803 92887"
        ]
      },
      {
        "name": "Parli",
        "address": "Gharnikar Road Deshmukh Complex Parli Vaijnath Dist. Beed, Maharashtra 431515",
        "phones": [
          "+91 97657 44777"
        ]
      },
      {
        "name": "Udgir",
        "address": "opposite side of bus stand, near mahavir dryfruits, Tondchirkar Complex, Udgir 413517",
        "phones": [
          "+91 77448 63140"
        ]
      }
    ]
  }
];

export const branchCount = divisions.reduce((n, d) => n + d.branches.length, 0);
