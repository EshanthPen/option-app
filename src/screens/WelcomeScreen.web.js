import React from 'react';
import SignIn from '../components/auth/SignIn';

export default function WelcomeScreenWeb({ onAuthStart, onAuthReset, onGuestMode }) {
    const handleAuthSuccess = () => {
        if (onAuthReset) onAuthReset();
    };

    return (
        <SignIn 
            onAuthSuccess={handleAuthSuccess}
            onGuestMode={onGuestMode}
        />
    );
}
