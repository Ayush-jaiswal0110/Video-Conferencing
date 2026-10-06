import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import LandingPage from './pages/landing';
test('landing page offers the AI voice test', async () => {
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<BrowserRouter><LandingPage /></BrowserRouter>));
  expect(container.querySelector('a[href="/agent"]').textContent).toContain('Talk with AI agent');
  await act(async () => root.unmount()); container.remove();
});
