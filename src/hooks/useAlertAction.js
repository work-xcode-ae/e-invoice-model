import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Turns an alert/notification action into navigation (renew → cart, add-on → packages…). */
export function useAlertAction() {
  const navigate = useNavigate();
  const { user, setCart } = useAuth();
  return (action) => {
    switch (action) {
      case 'renew':
        if (user?.subscription) { setCart({ type: 'package', packageId: user.subscription.packageId, months: 1 }); navigate('/cart'); }
        else navigate('/packages');
        break;
      case 'addon': navigate('/packages#addons'); break;
      case 'packages': navigate('/packages'); break;
      case 'plan': navigate('/dashboard?tab=plan'); break;
      case 'invoices': navigate('/dashboard?tab=invoices'); break;
      case 'company': navigate('/dashboard?tab=company'); break;
      case 'customers': navigate('/dashboard?tab=customers'); break;
      case 'items': navigate('/dashboard?tab=items'); break;
      case 'users': navigate('/dashboard?tab=users'); break;
      case 'support': navigate('/dashboard?tab=support'); break;
      case 'reports': navigate('/dashboard?tab=reports'); break;
      case 'integrations': navigate('/dashboard?tab=invoices'); break;
      default: break;
    }
  };
}

export const ACTION_LABEL = { renew: 'Renew now', addon: 'Buy add-on', packages: 'View packages', plan: 'View plan', invoices: 'View invoices', company: 'Add company', customers: 'View customers', items: 'View items', users: 'Manage users', support: 'Open support', reports: 'View reports' };
