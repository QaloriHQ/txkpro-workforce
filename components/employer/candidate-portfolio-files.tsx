import type { PortfolioFile } from "@/lib/student-portfolio/types";
import { portfolioRpc } from "@/lib/student-portfolio/repository";
export async function CandidatePortfolioFiles({
  studentId,
  employerId,
  hiringNeedId,
}: {
  studentId: string;
  employerId: string;
  hiringNeedId: string | null;
}) {
  const files = await portfolioRpc<PortfolioFile[]>(
    "student_portfolio_employer_files",
    {
      p_student: studentId,
      p_employer: employerId,
      p_hiring_need: hiringNeedId,
    },
  );
  return (
    <section className="card" style={{ marginTop: 18 }}>
      <h2>Student-shared documents</h2>
      <p className="card-sub">
        Student-uploaded files retain their source; uploads do not establish
        Instructor verification.
      </p>
      {files.length ? (
        <div className="portfolio-grid">
          {files.map((f) => (
            <article className="portfolio-item" key={f.id}>
              <h3>{f.title}</h3>
              <p className="muted">
                {f.kind} · {Math.ceil(f.size / 1024)} KB
              </p>
              <a
                className="button"
                href={`/api/student/portfolio/files/${f.id}?${new URLSearchParams({ employerId, ...(hiringNeedId ? { hiringNeedId } : {}) })}`}
                download
              >
                Download
              </a>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty">
          No documents shared with your authorized Employer scope.
        </p>
      )}
    </section>
  );
}
