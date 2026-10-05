import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "node:crypto";

function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1${salt.toString("base64url")}${derived.toString("base64url")}`;
}

const DEMO_PASSWORD = process.env.CAREBRIDGE_UAT_PASSWORD ?? "CareBridge-UAT-Local-Only-2026!";


const prisma = new PrismaClient();

const doctors = [
  {
    slug: "dr-anil-sharma",
    name: "Dr. Anil Sharma",
    initials: "AS",
    specialty: "Orthopedics",
    location: "Mumbai, India",
    rating: 4.9,
    experienceYears: 20,
    consultationPriceUsd: 25,
    expertise: ["Joint replacement", "Sports medicine", "Knee care"],
    bio: "Experienced orthopedic specialist focused on practical, patient-centered evaluation and treatment planning.",
    comparableLowUsd: 150,
    comparableHighUsd: 350,
  },
  {
    slug: "dr-meera-patel",
    name: "Dr. Meera Patel",
    initials: "MP",
    specialty: "Cardiology",
    location: "Ahmedabad, India",
    rating: 4.8,
    experienceYears: 17,
    consultationPriceUsd: 30,
    expertise: ["Preventive cardiology", "Hypertension", "Heart health"],
    bio: "Cardiology specialist with a focus on prevention, risk assessment and long-term heart health.",
    comparableLowUsd: 180,
    comparableHighUsd: 400,
  },
  {
    slug: "dr-rhea-kapoor",
    name: "Dr. Rhea Kapoor",
    initials: "RK",
    specialty: "Dermatology",
    location: "Bengaluru, India",
    rating: 4.9,
    experienceYears: 14,
    consultationPriceUsd: 22,
    expertise: ["Acne", "Skin conditions", "Hair & scalp"],
    bio: "Dermatology specialist providing evidence-based evaluation for common skin and scalp concerns.",
    comparableLowUsd: 125,
    comparableHighUsd: 300,
  },
  {
    slug: "dr-arjun-nair",
    name: "Dr. Arjun Nair",
    initials: "AN",
    specialty: "Neurology",
    location: "Chennai, India",
    rating: 4.8,
    experienceYears: 18,
    consultationPriceUsd: 35,
    expertise: ["Headache care", "Neurological evaluation", "Second opinion"],
    bio: "Neurology specialist supporting structured assessment and second-opinion consultations.",
    comparableLowUsd: 200,
    comparableHighUsd: 450,
  },
];

function addDays(base: Date, days: number, hours: number, minutes = 0) {
  const date = new Date(base);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hours, minutes, 0, 0);
  return date;
}

async function main() {
  const specialtyNames = [...new Set(doctors.map((doctor) => doctor.specialty))];
  const specialtyMap = new Map<string, string>();

  for (const name of specialtyNames) {
    const specialty = await prisma.specialty.upsert({ where: { name }, update: {}, create: { name } });
    specialtyMap.set(name, specialty.id);
  }

  let slotCount = 0;
  for (const doctor of doctors) {
    const email = `${doctor.slug}@demo.carebridge.local`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { role: "DOCTOR", passwordHash: hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date() },
      create: { email, role: "DOCTOR", passwordHash: hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date() },
    });

    const savedDoctor = await prisma.doctor.upsert({
      where: { slug: doctor.slug },
      update: {
        name: doctor.name,
        initials: doctor.initials,
        location: doctor.location,
        rating: doctor.rating,
        experienceYears: doctor.experienceYears,
        consultationPriceUsd: doctor.consultationPriceUsd,
        expertise: doctor.expertise,
        bio: doctor.bio,
        specialtyId: specialtyMap.get(doctor.specialty)!,
        status: "VERIFIED",
        isVerified: true,
        isActive: true,
      },
      create: {
        userId: user.id,
        name: doctor.name,
        initials: doctor.initials,
        location: doctor.location,
        rating: doctor.rating,
        experienceYears: doctor.experienceYears,
        consultationPriceUsd: doctor.consultationPriceUsd,
        expertise: doctor.expertise,
        bio: doctor.bio,
        specialtyId: specialtyMap.get(doctor.specialty)!,
        slug: doctor.slug,
        status: "VERIFIED",
        isVerified: true,
        isActive: true,
      },
    });

    await prisma.costComparison.upsert({
      where: { doctorId: savedDoctor.id },
      update: {
        patientCountry: "US",
        comparableLowUsd: doctor.comparableLowUsd,
        comparableHighUsd: doctor.comparableHighUsd,
        sourceLabel: "Demo benchmark — replace with approved production methodology",
        disclaimer: "Illustrative comparison only. Actual US prices vary by provider, location, insurance, visit type and complexity.",
      },
      create: {
        doctorId: savedDoctor.id,
        patientCountry: "US",
        comparableLowUsd: doctor.comparableLowUsd,
        comparableHighUsd: doctor.comparableHighUsd,
        sourceLabel: "Demo benchmark — replace with approved production methodology",
        disclaimer: "Illustrative comparison only. Actual US prices vary by provider, location, insurance, visit type and complexity.",
      },
    });

    for (let day = 1; day <= 14; day += 1) {
      for (const hour of [9, 11, 14, 16]) {
        const startsAt = addDays(new Date(), day, hour);
        const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
        await prisma.availabilitySlot.upsert({
          where: { doctorId_startsAt: { doctorId: savedDoctor.id, startsAt } },
          update: { endsAt, status: "AVAILABLE" },
          create: { doctorId: savedDoctor.id, startsAt, endsAt, status: "AVAILABLE" },
        });
        slotCount += 1;
      }
    }
  }

  const adminEmail = "demo-admin@demo.carebridge.local";
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN", passwordHash: hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date() },
    create: { email: adminEmail, role: "ADMIN", passwordHash: hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date() },
  });

  const patientEmail = "demo-patient@demo.carebridge.local";
  const patientUser = await prisma.user.upsert({
    where: { email: patientEmail },
    update: { role: "PATIENT", passwordHash: hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date() },
    create: { email: patientEmail, role: "PATIENT", passwordHash: hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date() },
  });
  await prisma.patient.upsert({
    where: { userId: patientUser.id },
    update: { firstName: "Demo", lastName: "Patient", country: "US" },
    create: { userId: patientUser.id, firstName: "Demo", lastName: "Patient", country: "US" },
  });

  console.log(`Seeded ${doctors.length} demo doctors and ${slotCount} availability slots.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
