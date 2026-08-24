
/**
 * Utility functions for testing the API endpoints
 *
 * This file provides a collection of functions that can be used
 * to test the API endpoints using tools like Jest or directly
 * in a browser console for debugging purposes.
 */

import axios from 'axios';

// Setup API client with base URL
const apiClient = axios.create({
  baseURL: process.env.API_URL || 'http://localhost:5000/api/v1',
  withCredentials: true
});

// Store auth token
let authToken = null;

// Utility to set auth token in request headers
apiClient.interceptors.request.use(
  (config) => {
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Get CSRF token for forms
export const getCsrfToken = async () => {
  try {
    const response = await apiClient.get('/auth/csrf-token');
    return response.data.token;
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
    throw error;
  }
};

// Register a new user
export const registerUser = async (userData) => {
  try {
    const csrfToken = await getCsrfToken();
    const response = await apiClient.post('/auth/register', userData, {
      headers: { 'X-CSRF-TOKEN': csrfToken }
    });
    authToken = response.data.token;
    return response.data;
  } catch (error) {
    console.error('Registration failed:', error.response?.data || error.message);
    throw error;
  }
};

// Login user
export const loginUser = async (email, password) => {
  try {
    const csrfToken = await getCsrfToken();
    const response = await apiClient.post('/auth/login', { email, password }, {
      headers: { 'X-CSRF-TOKEN': csrfToken }
    });
    authToken = response.data.token;
    return response.data;
  } catch (error) {
    console.error('Login failed:', error.response?.data || error.message);
    throw error;
  }
};

// Get current user profile
export const getCurrentUser = async () => {
  try {
    const response = await apiClient.get('/auth/me');
    return response.data;
  } catch (error) {
    console.error('Failed to get user profile:', error.response?.data || error.message);
    throw error;
  }
};

// Create a doctor profile
export const createDoctorProfile = async (doctorData) => {
  try {
    const csrfToken = await getCsrfToken();
    const response = await apiClient.post('/doctors', doctorData, {
      headers: { 'X-CSRF-TOKEN': csrfToken }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to create doctor profile:', error.response?.data || error.message);
    throw error;
  }
};

// Get all doctors
export const getAllDoctors = async (filters = {}) => {
  try {
    const response = await apiClient.get('/doctors', { params: filters });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch doctors:', error.response?.data || error.message);
    throw error;
  }
};

// Get doctor by ID
export const getDoctorById = async (doctorId) => {
  try {
    const response = await apiClient.get(`/doctors/${doctorId}`);
    return response.data;
  } catch (error) {
    console.error('Failed to fetch doctor:', error.response?.data || error.message);
    throw error;
  }
};

// Create an appointment
export const createAppointment = async (appointmentData) => {
  try {
    const csrfToken = await getCsrfToken();
    const response = await apiClient.post('/appointments', appointmentData, {
      headers: { 'X-CSRF-TOKEN': csrfToken }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to create appointment:', error.response?.data || error.message);
    throw error;
  }
};

// Get user appointments
export const getUserAppointments = async () => {
  try {
    const response = await apiClient.get('/appointments');
    return response.data;
  } catch (error) {
    console.error('Failed to fetch appointments:', error.response?.data || error.message);
    throw error;
  }
};

// Create a new conversation
export const createConversation = async (conversationData) => {
  try {
    const csrfToken = await getCsrfToken();
    const response = await apiClient.post('/messages/conversations', conversationData, {
      headers: { 'X-CSRF-TOKEN': csrfToken }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to create conversation:', error.response?.data || error.message);
    throw error;
  }
};

// Send a message
export const sendMessage = async (conversationId, messageData) => {
  try {
    const csrfToken = await getCsrfToken();
    const response = await apiClient.post(`/messages/conversations/${conversationId}/messages`, messageData, {
      headers: { 'X-CSRF-TOKEN': csrfToken }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to send message:', error.response?.data || error.message);
    throw error;
  }
};

// Example test workflow
export const runTestWorkflow = async () => {
  try {
    // Register test user
    const newUser = await registerUser({
      firstName: 'Test',
      lastName: 'User',
      email: 'testuser@example.com',
      password: 'Password123!',
      role: 'patient',
      phone: '1234567890'
    });
    console.log('Registered user:', newUser);

    // Get user profile
    const userProfile = await getCurrentUser();
    console.log('User profile:', userProfile);

    // Get all doctors
    const doctors = await getAllDoctors();
    console.log('Doctors:', doctors);

    // If doctors exist, create an appointment with first doctor
    if (doctors.data && doctors.data.length > 0) {
      const appointment = await createAppointment({
        doctor: doctors.data[0].id,
        appointmentDate: '2025-06-01',
        startTime: '10:00',
        endTime: '10:30',
        type: 'video',
        reasonForVisit: 'Test appointment'
      });
      console.log('Created appointment:', appointment);
    }

    console.log('Test workflow completed successfully');
  } catch (error) {
    console.error('Test workflow failed:', error);
  }
};
