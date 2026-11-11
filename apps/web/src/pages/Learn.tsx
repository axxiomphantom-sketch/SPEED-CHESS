import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, ChevronRight, Clock, GraduationCap } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Button, Card, CardHead, Empty, Loading, Progress, Tabs } from '../components/ui';

interface Course {
  id: string; slug: string; title: string; level: string; summary: string; description: string;
  icon: string | null; minutes: number; lessonCount: number; completedLessons: number; progress: number;
}

interface CourseDetail {
  course: Course & { lessons: Array<{ id: string; slug: string; title: string; level: string; minutes: number; progress: { status: string; quiz_score: number | null; quiz_total: number | null } | null }> };
}

export function Learn() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [level, setLevel] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');
  const [openCourse, setOpenCourse] = useState<string | null>(null);
  const [detail, setDetail] = useState<CourseDetail['course'] | null>(null);

  useEffect(() => {
    api.get<{ courses: Course[] }>('/learn/courses').then(d => setCourses(d.courses)).catch(() => setCourses([]));
  }, [user]);

  useEffect(() => {
    if (!openCourse) { setDetail(null); return; }
    api.get<CourseDetail>(`/learn/courses/${openCourse}`).then(d => setDetail(d.course)).catch(() => setDetail(null));
  }, [openCourse]);

  const filtered = courses?.filter(c => level === 'all' || c.level === level) ?? [];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="eyebrow"><BookOpen size={13} style={{ verticalAlign: -2 }} /> Learn Chess</div>
          <h1>Learning centre</h1>
          <p>Structured courses from complete beginner to advanced. Every lesson has a demonstration board, explanations you can revisit and a knowledge test.</p>
        </div>
        <Link to="/how-to-play" className="btn btn-secondary">How to Play Academy</Link>
      </header>

      <Tabs
        value={level}
        onChange={setLevel}
        label="Course level"
        tabs={[
          { id: 'all', label: 'All levels', count: courses?.length },
          { id: 'beginner', label: 'Beginner' },
          { id: 'intermediate', label: 'Intermediate' },
          { id: 'advanced', label: 'Advanced' },
        ]}
      />

      {courses === null ? <Loading rows={3} /> : filtered.length === 0 ? (
        <Empty icon={<BookOpen size={26} />} title="No courses at this level yet">
          New courses are added by approved instructors. Try the beginner path in the meantime.
        </Empty>
      ) : (
        <div className="grid grid-auto">
          {filtered.map(course => (
            <Card key={course.id} hover>
              <div className="row-between" style={{ marginBottom: 10 }}>
                <span className="pillar-icon" style={{ margin: 0 }}><GraduationCap size={18} /></span>
                <Badge tone={course.level === 'beginner' ? 'success' : course.level === 'intermediate' ? 'warning' : 'purple'}>{course.level}</Badge>
              </div>
              <h3 style={{ marginBottom: 4 }}>{course.title}</h3>
              <p className="small muted" style={{ minHeight: 60 }}>{course.summary}</p>
              <div className="row-between tiny muted" style={{ marginBottom: 6 }}>
                <span>{course.lessonCount} lessons</span>
                <span className="row" style={{ gap: 4 }}><Clock size={11} /> {course.minutes} min</span>
              </div>
              <Progress value={course.progress} />
              <div className="row-between mt-2">
                <span className="tiny" style={{ fontWeight: 700 }}>{course.progress}% complete</span>
                <Button size="sm" variant={course.progress > 0 ? 'primary' : 'secondary'} onClick={() => { setOpenCourse(course.slug); setDetail(null); }}>
                  {course.progress > 0 ? 'Continue' : 'Open course'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {openCourse && (
        <div style={{ marginTop: 26 }}>
          <Card>
            <CardHead
              title={detail?.title ?? 'Loading course…'}
              subtitle={detail ? `${detail.lessons.length} lessons · ${detail.level} · ${detail.minutes} minutes` : undefined}
              action={<Button variant="ghost" size="sm" onClick={() => setOpenCourse(null)}>Close</Button>}
            />
            {!detail ? <Loading rows={1} /> : (
              <>
                <p className="small muted">{detail.description}</p>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>#</th><th>Lesson</th><th>Length</th><th>Status</th><th /></tr></thead>
                    <tbody>
                      {detail.lessons.map((lesson, index) => (
                        <tr key={lesson.id}>
                          <td className="muted">{index + 1}</td>
                          <td style={{ fontWeight: 500 }}>{lesson.title}</td>
                          <td className="muted nowrap">{lesson.minutes} min</td>
                          <td>
                            {lesson.progress?.status === 'completed'
                              ? <Badge tone="success"><Check size={11} /> Completed{lesson.progress.quiz_total ? ` · ${lesson.progress.quiz_score}/${lesson.progress.quiz_total}` : ''}</Badge>
                              : lesson.progress?.status === 'started' ? <Badge tone="warning">In progress</Badge> : <Badge tone="muted">Not started</Badge>}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Link to={`/learn/lesson/${lesson.slug}`} className="btn btn-sm btn-secondary">
                              {lesson.progress?.status === 'completed' ? 'Review' : 'Open'} <ChevronRight size={13} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
