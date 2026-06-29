import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

const ALLOWED_EMAILS = new Set([
  "carter@next10.us",
  "cooper@next10.us",
  "allen@next10.us",
  "melissa@next10.us",
  "lisa@balancedcomfort.com",
  "jakewright@balancedcomfort.com",
  "mike@callsailors.com",
])

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    signIn({ user }) {
      return user.email ? ALLOWED_EMAILS.has(user.email) : false
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
})
