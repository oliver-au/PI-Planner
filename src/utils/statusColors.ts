import type { TicketStatus } from '../types';

type StatusColors = {
  bg: string;
  text: string;
  border: string;
};

export const getStatusColors = (status: TicketStatus): StatusColors => {
  switch (status) {
    case 'TO DO':
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300',
      };
    case 'IN PROGRESS':
      return {
        bg: 'bg-blue-100',
        text: 'text-blue-700',
        border: 'border-blue-300',
      };
    case 'READY FOR TEST':
      return {
        bg: 'bg-purple-100',
        text: 'text-purple-700',
        border: 'border-purple-300',
      };
    case 'IN TEST':
      return {
        bg: 'bg-yellow-100',
        text: 'text-yellow-700',
        border: 'border-yellow-300',
      };
    case 'PO REVIEW':
      return {
        bg: 'bg-orange-100',
        text: 'text-orange-700',
        border: 'border-orange-300',
      };
    case 'DONE':
      return {
        bg: 'bg-green-100',
        text: 'text-green-700',
        border: 'border-green-300',
      };
    default:
      return {
        bg: 'bg-slate-100',
        text: 'text-slate-700',
        border: 'border-slate-300',
      };
  }
};

export const STATUS_OPTIONS: TicketStatus[] = [
  'TO DO',
  'IN PROGRESS',
  'READY FOR TEST',
  'IN TEST',
  'PO REVIEW',
  'DONE',
];
