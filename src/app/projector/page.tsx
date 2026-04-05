import ProjectorClient from "./ProjectorClient";

export default function ProjectorPage({ searchParams }: { searchParams: { key?: string } }) {
  const projectorKey = process.env.PROJECTOR_KEY || "dummy_key_if_not_set";

  if (searchParams.key !== projectorKey) {
    return (
      <div style={{ backgroundColor: "black", color: "white", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
        Unauthorized.
      </div>
    );
  }

  return <ProjectorClient />;
}
