'use strict';

/*
 * Fechas "de calendario" (YYYY-MM-DD) en hora peninsular, independientes de la
 * zona horaria del servidor.
 */

const { config } = require('./config');

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** { fecha: 'YYYY-MM-DD', hora: 0-23 } del instante dado en Europe/Madrid. */
function madridNow(now = new Date()) {
  const p = Object.fromEntries(partsFormatter.formatToParts(now).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour), minuto: Number(p.minute) };
}

function addDays(fecha, days) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 1 = lunes … 7 = domingo. */
function isoWeekday(fecha) {
  const day = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function isValidDate(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return false;
  return new Date(`${fecha}T12:00:00Z`).toISOString().slice(0, 10) === fecha;
}

const longFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** «miércoles, 14 de octubre de 2026» */
function formatFecha(fecha) {
  return longFormatter.format(new Date(`${fecha}T12:00:00Z`));
}

module.exports = { madridNow, addDays, isoWeekday, isValidDate, formatFecha };
