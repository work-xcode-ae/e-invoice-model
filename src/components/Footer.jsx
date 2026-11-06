import { Link } from 'react-router-dom';
import { Mail, MapPin, Globe } from 'lucide-react';
import Logo from './Logo';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo tag={false} />
            <p>
              Accredited UAE e-invoicing: Peppol PINT AE exchange, Tax Data reporting to the FTA, and onboarding
              support, all under one brand.
            </p>
            <p className="flex items-center gap-1 mb-0"><MapPin size={15} /> Al Wahda Commercial Tower, Office 1504, Abu Dhabi</p>
          </div>
          <div>
            <h5>Platform</h5>
            <ul>
              <li><Link to="/packages">Packages & Pricing</Link></li>
              <li><Link to="/requirements">Requirements</Link></li>
              <li><Link to="/register">Create Account</Link></li>
              <li><Link to="/login">Customer Login</Link></li>
            </ul>
          </div>
          <div>
            <h5>Solutions</h5>
            <ul>
              <li><a href="/#how-it-works">How it works</a></li>
              <li><a href="/#integrations">Integrations & API</a></li>
              <li><a href="/#compliance">Compliance & Security</a></li>
              <li><a href="/#faq">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h5>Contact</h5>
            <ul>
              <li><Link to="/contact">Contact Us</Link></li>
              <li className="flex items-center gap-1"><Mail size={14} /> <a href="mailto:info@modelfc.ae">info@modelfc.ae</a></li>
              <li className="flex items-center gap-1"><Globe size={14} /> <a href="https://www.modelfc.ae" target="_blank" rel="noreferrer">www.modelfc.ae</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Model Financial Consulting. All rights reserved.</span>
          <span>ISO/IEC 27001:2022 · ISO 22301:2019 · Peppol Seat PAE001264</span>
        </div>
      </div>
    </footer>
  );
}
