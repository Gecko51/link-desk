import { render, screen } from "@testing-library/react";
import App from "@/App";

describe("App routing", () => {
  it("renders the home route at cold start", () => {
    render(<App />);
    expect(screen.getByTestId("home-route")).toBeInTheDocument();
  });
});
