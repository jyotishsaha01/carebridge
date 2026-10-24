import { describe, expect, it, vi } from "vitest";
import { publishNotification, subscribeNotifications } from "./notificationRealtime";

describe("real-time notification event hub", () => {
  it("delivers a notification only to subscribers for the recipient", () => {
    const patient = vi.fn();
    const doctor = vi.fn();
    const stopPatient = subscribeNotifications("patient-1", patient);
    const stopDoctor = subscribeNotifications("doctor-1", doctor);

    const notification = { id: "notification-1", title: "Prescription available" };
    publishNotification("patient-1", notification);

    expect(patient).toHaveBeenCalledOnce();
    expect(patient).toHaveBeenCalledWith(notification);
    expect(doctor).not.toHaveBeenCalled();

    stopPatient();
    stopDoctor();
  });

  it("stops delivering after a subscriber disconnects", () => {
    const subscriber = vi.fn();
    const unsubscribe = subscribeNotifications("patient-disconnect", subscriber);
    unsubscribe();

    publishNotification("patient-disconnect", { id: "notification-2" });

    expect(subscriber).not.toHaveBeenCalled();
  });

  it("continues delivery when one subscriber throws", () => {
    const brokenSubscriber = vi.fn(() => {
      throw new Error("disconnected");
    });
    const healthySubscriber = vi.fn();
    const stopBroken = subscribeNotifications("patient-shared", brokenSubscriber);
    const stopHealthy = subscribeNotifications("patient-shared", healthySubscriber);

    publishNotification("patient-shared", { id: "notification-3" });

    expect(brokenSubscriber).toHaveBeenCalledOnce();
    expect(healthySubscriber).toHaveBeenCalledOnce();

    stopBroken();
    stopHealthy();
  });
});
