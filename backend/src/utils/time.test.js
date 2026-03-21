import { describe, it, expect } from 'vitest';
import { isValidAppointmentTime } from './time.js';

describe('isValidAppointmentTime', () => {
    it('should return true for 00 minutes', () => {
        expect(isValidAppointmentTime('08:00')).toBe(true);
        expect(isValidAppointmentTime('14:00')).toBe(true);
    });

    it('should return true for 30 minutes', () => {
        expect(isValidAppointmentTime('08:30')).toBe(true);
        expect(isValidAppointmentTime('22:30')).toBe(true);
    });

    it('should return false for other minutes', () => {
        expect(isValidAppointmentTime('08:15')).toBe(false);
        expect(isValidAppointmentTime('10:45')).toBe(false);
        expect(isValidAppointmentTime('12:01')).toBe(false);
    });

    it('should return false for invalid formats', () => {
        expect(isValidAppointmentTime('')).toBe(false);
        expect(isValidAppointmentTime(null)).toBe(false);
        expect(isValidAppointmentTime('08')).toBe(false);
        expect(isValidAppointmentTime('morning')).toBe(false);
    });
});
