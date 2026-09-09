import Fastify from "fastify";
import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { registerAuthRoutes } from "./auth";
import { registerBookingRoutes } from "./booking";
import { registerMedicalIntakeRoutes } from "./medicalIntake";
import { registerClinicalRoutes } from "./clinical";
import { registerDocumentRoutes } from "./documents";
import { registerPatientDashboardRoutes } from "./patientDashboard";
import { registerVideoRoutes } from "./video";
import { registerProductionReadiness } from "./productionReadiness";
import { registerAdminRoutes } from "./admin";
import { registerPaymentRoutes } from "./paymentRoutes";
import { registerCarePlatformRoutes } from "./carePlatform";
import { registerDoctorOperationsRoutes } from "./doctorOperations";

const env = z.object({ PORT:z.coerce.number().int().positive().default(4000), HOST:z.string().default("0.0.0.0"), DATABASE_URL:z.string().min(1), CORS_ORIGIN:z.string().default("http://localhost:3000"), ALLOW_DEMO_AUTH:z.string().default("false").transform(v=>v==="true") }).parse(process.env);
export const prisma=new PrismaClient();
function serializeDoctor(doctor:any){return{id:doctor.slug,name:doctor.name,initials:doctor.initials,specialty:doctor.specialty.name,location:doctor.location,rating:Number(doctor.rating),experience:doctor.experienceYears,price:Number(doctor.consultationPriceUsd),usLow:doctor.costComparison?Number(doctor.costComparison.comparableLowUsd):null,usHigh:doctor.costComparison?Number(doctor.costComparison.comparableHighUsd):null,expertise:doctor.expertise,bio:doctor.bio,verified:doctor.isVerified};}
export async function buildApp(){const app=Fastify({logger:true});await app.register(cors,{origin:env.CORS_ORIGIN,credentials:true});app.get("/health",async()=>({status:"ok",service:"carebridge-api"}));app.get("/v1/specialties",async()=>prisma.specialty.findMany({orderBy:{name:"asc"}}));app.get("/v1/doctors",async(request)=>{const query=z.object({specialty:z.string().optional(),q:z.string().trim().min(1).optional(),limit:z.coerce.number().int().min(1).max(50).default(20)}).parse(request.query);const doctors=await prisma.doctor.findMany({where:{isVerified:true,isActive:true,specialty:query.specialty?{name:query.specialty}:undefined,...(query.q?{OR:[{name:{contains:query.q,mode:"insensitive"}},{bio:{contains:query.q,mode:"insensitive"}},{specialty:{name:{contains:query.q,mode:"insensitive"}}}]}:{})},include:{specialty:true,costComparison:true},orderBy:[{rating:"desc"},{experienceYears:"desc"}],take:query.limit});return doctors.map(serializeDoctor);});app.get("/v1/doctors/:slug",async(request,reply)=>{const{slug}=z.object({slug:z.string().min(1)}).parse(request.params);const doctor=await prisma.doctor.findUnique({where:{slug},include:{specialty:true,costComparison:true}});if(!doctor||!doctor.isActive||!doctor.isVerified)return reply.code(404).send({error:"Doctor not found"});return{...serializeDoctor(doctor),costComparison:doctor.costComparison?{patientCountry:doctor.costComparison.patientCountry,comparableLowUsd:Number(doctor.costComparison.comparableLowUsd),comparableHighUsd:Number(doctor.costComparison.comparableHighUsd),sourceLabel:doctor.costComparison.sourceLabel,disclaimer:doctor.costComparison.disclaimer}:null};});await registerAuthRoutes(app);await registerBookingRoutes(app,env.ALLOW_DEMO_AUTH);await registerMedicalIntakeRoutes(app);await registerClinicalRoutes(app);await registerDocumentRoutes(app);await registerPatientDashboardRoutes(app);await registerProductionReadiness(app);await registerVideoRoutes(app);await registerAdminRoutes(app);await registerPaymentRoutes(app);await registerCarePlatformRoutes(app);await registerDoctorOperationsRoutes(app);app.addHook("onClose",async()=>prisma.$disconnect());return app;}
async function start(){const app=await buildApp();await app.listen({port:env.PORT,host:env.HOST});}start().catch(async error=>{console.error(error);await prisma.$disconnect();process.exit(1);});
