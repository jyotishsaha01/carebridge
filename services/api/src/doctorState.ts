import type { Prisma } from "@prisma/client";
import { prisma } from "./server";

export class DoctorStateError extends Error {
  constructor(public readonly statusCode: 404 | 409, message: string) { super(message); }
}

export async function withLockedDoctor<T>(doctorId: string, operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(async (transaction) => {
      const locked = await transaction.doctor.updateMany({ where: { id: doctorId }, data: { updatedAt: new Date() } });
      if (locked.count !== 1) throw new DoctorStateError(404, "Doctor profile not found");
      return operation(transaction);
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034") throw new DoctorStateError(409, "Doctor credentials changed while saving. Refresh and try again.");
    throw error;
  }
}
