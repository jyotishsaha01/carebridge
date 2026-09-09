export type Doctor = {
  id: string;
  name: string;
  initials: string;
  specialty: string;
  location: string;
  rating: number;
  experience: number;
  price: number;
  usLow: number;
  usHigh: number;
  expertise: string[];
  bio: string;
};

export const specialties = ["Orthopedics", "Cardiology", "Dermatology", "Neurology", "Gastroenterology"];

export const doctors: Doctor[] = [
  {
    id: "dr-anil-sharma",
    name: "Dr. Anil Sharma",
    initials: "AS",
    specialty: "Orthopedics",
    location: "Mumbai, India",
    rating: 4.9,
    experience: 20,
    price: 25,
    usLow: 150,
    usHigh: 350,
    expertise: ["Joint replacement", "Sports medicine", "Knee care"],
    bio: "Experienced orthopedic specialist focused on practical, patient-centered evaluation and treatment planning.",
  },
  {
    id: "dr-meera-patel",
    name: "Dr. Meera Patel",
    initials: "MP",
    specialty: "Cardiology",
    location: "Ahmedabad, India",
    rating: 4.8,
    experience: 17,
    price: 30,
    usLow: 180,
    usHigh: 400,
    expertise: ["Preventive cardiology", "Hypertension", "Heart health"],
    bio: "Cardiology specialist with a focus on prevention, risk assessment and long-term heart health.",
  },
  {
    id: "dr-rhea-kapoor",
    name: "Dr. Rhea Kapoor",
    initials: "RK",
    specialty: "Dermatology",
    location: "Bengaluru, India",
    rating: 4.9,
    experience: 14,
    price: 22,
    usLow: 125,
    usHigh: 300,
    expertise: ["Acne", "Skin conditions", "Hair & scalp"],
    bio: "Dermatology specialist providing evidence-based evaluation for common skin and scalp concerns.",
  },
  {
    id: "dr-arjun-nair",
    name: "Dr. Arjun Nair",
    initials: "AN",
    specialty: "Neurology",
    location: "Chennai, India",
    rating: 4.8,
    experience: 18,
    price: 35,
    usLow: 200,
    usHigh: 450,
    expertise: ["Headache care", "Neurological evaluation", "Second opinion"],
    bio: "Neurology specialist supporting structured assessment and second-opinion consultations.",
  },
];
