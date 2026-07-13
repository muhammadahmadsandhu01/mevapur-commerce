'use client';

import { CheckCircle, Circle, Truck, Package, MapPin } from 'lucide-react';

interface TimelineStep {
  status: string;
  date: string;
  completed: boolean;
}

interface OrderTimelineProps {
  timeline: TimelineStep[];
}

export default function OrderTimeline({ timeline }: OrderTimelineProps) {
  const getIcon = (status: string, completed: boolean) => {
    if (status === 'Shipped' || status === 'Out For Delivery') return <Truck size={16} />;
    if (status === 'Packed' || status === 'Processing') return <Package size={16} />;
    if (status === 'Delivered') return <MapPin size={16} />;
    return completed ? <CheckCircle size={16} /> : <Circle size={16} />;
  };

  return (
    <div style={{ padding: '20px 0' }}>
      {timeline.map((step, index) => (
        <div key={index} style={{ display: 'flex', gap: '16px', marginBottom: index === timeline.length - 1 ? '0' : '24px', position: 'relative' }}>
          {/* Vertical Line */}
          {index !== timeline.length - 1 && (
            <div style={{
              position: 'absolute', left: '15px', top: '32px', bottom: '-24px',
              width: '2px',
              backgroundColor: step.completed ? '#0F766E' : '#E5E7EB'
            }} />
          )}
          
          {/* Icon Circle */}
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            backgroundColor: step.completed ? '#0F766E' : 'white',
            border: `2px solid ${step.completed ? '#0F766E' : '#E5E7EB'}`,
            color: step.completed ? 'white' : '#9CA3AF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, zIndex: 1
          }}>
            {getIcon(step.status, step.completed)}
          </div>
          
          {/* Content */}
          <div style={{ flex: 1, paddingTop: '4px' }}>
            <div style={{ 
              fontWeight: '700', 
              fontSize: '14px',
              color: step.completed ? '#111827' : '#9CA3AF'
            }}>
              {step.status}
            </div>
            {step.date && (
              <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
                {step.date}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}