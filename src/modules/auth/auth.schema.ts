import { z } from 'zod';

export const googleExchangeSchema = z.object({
  idToken: z.string().min(1, 'Google ID token is required'),
  // Optional profile fallback in development or mock mode
  devMockProfile: z
    .object({
      name: z.string(),
      email: z.string().email(),
      googleSub: z.string(),
    })
    .optional(),
  expoPushToken: z.string().optional(),
});

export const employeePinLoginSchema = z.object({
  workplaceId: z.string().optional(),
  employeeCode: z.string().min(1, 'Employee code is required'),
  pin: z.string().min(4, 'PIN must be at least 4 digits').max(6, 'PIN maximum 6 digits'),
  expoPushToken: z.string().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const updatePushTokenSchema = z.object({
  expoPushToken: z.string().min(1, 'Expo push token is required'),
});

export const mpinSetupSchema = z.object({
  mpin: z.string().regex(/^\d{4}$/, 'MPIN must be exactly 4 numeric digits'),
  enableBiometric: z.boolean().optional(),
});

export const mpinVerifySchema = z.object({
  mpin: z.string().regex(/^\d{4}$/, 'MPIN must be exactly 4 numeric digits'),
});

export const mpinChangeSchema = z.object({
  oldMpin: z.string().regex(/^\d{4}$/, 'Old MPIN must be exactly 4 numeric digits'),
  newMpin: z.string().regex(/^\d{4}$/, 'New MPIN must be exactly 4 numeric digits'),
});

export const mpinBiometricSchema = z.object({
  enabled: z.boolean(),
});

