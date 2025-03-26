import cron from 'node-cron';
import axios from 'axios';

export const initCronJobs = (baseUrl: string) => {
  // Schedule processLists to run at 10 minutes past every even hour (10 */2 * * *)
  cron.schedule('10 */2 * * *', async () => {
    try {
      console.log('Running scheduled task: processLists');
      const response = await axios.get(`${baseUrl}/api/v1/books/processLists`);
      console.log('processLists completed with status:', response.status);
    } catch (error) {
      console.error('Error running processLists cron job:', error);
    }
  });

  // Schedule monitorBooks to run at 5 and 35 minutes past every hour (5,35 * * * *)
  cron.schedule('5,35 * * * *', async () => {
    try {
      console.log('Running scheduled task: monitorBooks');
      const response = await axios.get(`${baseUrl}/api/v1/books/monitorBooks`);
      console.log('monitorBooks completed with status:', response.status);
    } catch (error) {
      console.error('Error running monitorBooks cron job:', error);
    }
  });

  console.log('Cron jobs initialized successfully');
};
