import type { Prisma } from "@prisma/client";
import { prisma } from "./server";

/** Only fixed application messages from this error are returned to clients. */
export class AppointmentStateError extends Error {
  constructor(public readonly statusCode: 404 | 409, message: string) {
    super(message);
    this.name = "AppointmentStateError";
  }
}

export async function withLockedAppointment<T>(
  where: { id: string; patientId: string } | { id: string; doctorId: string },
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(async (transaction) => {
      // Both intake edits and clinical status changes first update this same row.
      // PostgreSQL holds its row lock until commit; SQLite serializes writers.
      // Authoritative state must be read only after this write has acquired it.
      const locked = await transaction.appointment.updateMany({ where, data: { updatedAt: new Date() } });
      if (locked.count !== 1) throw new AppointmentStateError(404, "Appointment not found");
      return operation(transaction);
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034") {
      throw new AppointmentStateError(409, "The appointment changed while saving. Refresh and try again.");
    }
    throw error;
  }
}
